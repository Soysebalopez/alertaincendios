"""
WHI-907 part 4 — SMN WRF 4 km wind forecast around Bahía Blanca.

Triggered by Supabase pg_cron twice a day (scheduled after merge, checkpoint
C5). A run's 73 hourly files are published ~2.5 h after it starts (the 00Z run
of 2026-09-14 landed between 02:15 and 02:29 UTC), so the cron belongs at
03:00 and 15:00 UTC. Picks the newest run whose first MAX_LEAD_HOURS files are
all published and reads them ONE AT A TIME — each file is ~31 MB for the whole
country — keeping only the grid cells within RADIUS_KM of Bahía Blanca, which
are upserted into `wind_forecast`. Until the
migration is approved (checkpoint C2) the table does not exist: the endpoint
answers 200 with skipped="table_missing".

URL: GET /api/smn-wrf-sync?secret=<CRON_SECRET>
Env vars: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
SUPABASE_SERVICE_ROLE_KEY.

All data handling lives in `smn_wrf.extract` (tested in tests/python); this
file only lists, downloads and writes.
"""
from __future__ import annotations

import hmac
import json
import os
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler

import boto3
import requests
import xarray as xr
from botocore import UNSIGNED
from botocore.client import Config

from smn_wrf import extract

BUCKET = "smn-ar-wrf"
REGION = "us-west-2"
# 18, not 12: a run is ingested ~3 h after it starts, so it has to cover until
# the next run arrives (12 h later + ingestion delay + margin).
MAX_LEAD_HOURS = 18
# Vercel stops the function at 300 s (maxDuration in vercel.json). Past this no
# new download starts. Each file is written as soon as it is read and leads go
# in order, so a cut only drops the farthest hours.
TIME_BUDGET_SECONDS = 240
# Explicit timeouts so one slow or stalled S3 connection cannot eat the budget.
S3_CONFIG = Config(
    signature_version=UNSIGNED,
    connect_timeout=10,
    read_timeout=30,
    retries={"max_attempts": 3, "mode": "standard"},
)
BAHIA_BLANCA = (-38.72, -62.27)
# ~180 grid cells per hour. Wider areas multiply rows by the square of the radius.
RADIUS_KM = 30.0
TABLE = "wind_forecast"
SOURCE = "smn-wrf"
BATCH_SIZE = 1000
TABLE_MISSING_MARKERS = ("PGRST205", "42P01")


def list_keys(client, prefixes: list[str]) -> list[str]:
    keys: list[str] = []
    for prefix in prefixes:
        token = None
        while True:
            kwargs = {"Bucket": BUCKET, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = client.list_objects_v2(**kwargs)
            keys.extend(obj["Key"] for obj in resp.get("Contents", []))
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
    return keys


def read_file_rows(client, key: str) -> list[dict]:
    """Download one SMN file and keep the grid cells around Bahía Blanca."""
    run_at, valid_at = extract.parse_key(key)
    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
        path = tmp.name
    try:
        client.download_file(BUCKET, key, path)
        with xr.open_dataset(path, decode_times=False) as ds:
            return [
                {"source": SOURCE, "run_at": run_at, "valid_at": valid_at, **point}
                for point in extract.points_near(ds, *BAHIA_BLANCA, radius_km=RADIUS_KM)
            ]
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def upsert(rows: list[dict]) -> tuple[int, str | None]:
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        return 0, "missing_supabase_env"
    inserted = 0
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        resp = requests.post(
            f"{url.rstrip('/')}/rest/v1/{TABLE}",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            json=batch,
            timeout=60,
        )
        if resp.status_code not in (200, 201, 204):
            if any(marker in resp.text for marker in TABLE_MISSING_MARKERS):
                return inserted, "table_missing"
            return inserted, f"supabase_status_{resp.status_code}: {resp.text[:200]}"
        inserted += len(batch)
    return inserted, None


def run_pipeline(now: datetime | None = None) -> dict:
    started = time.time()
    deadline = time.monotonic() + TIME_BUDGET_SECONDS
    now = now or datetime.now(timezone.utc)
    client = boto3.client("s3", region_name=REGION, config=S3_CONFIG)

    keys = extract.pick_run_keys(list_keys(client, extract.candidate_run_prefixes(now)), MAX_LEAD_HOURS)
    if not keys:
        return {"ok": True, "skipped": "no_complete_run", "seconds": round(time.time() - started, 2)}

    # Write each file as soon as it is read, so hours already stored survive if
    # Vercel stops the function. The first write error (a missing table
    # included) ends the run: there is no point downloading what cannot be kept.
    files_read = rows_read = inserted = 0
    error = None
    for key in keys:
        if time.monotonic() >= deadline:
            break
        rows = read_file_rows(client, key)
        files_read += 1
        rows_read += len(rows)
        written, error = upsert(rows)
        inserted += written
        if error:
            break

    result = {
        "ok": error is None,
        "run_at": extract.parse_key(keys[0])[0],
        "files_read": files_read,
        "files_planned": len(keys),
        "partial": files_read < len(keys),
        "rows": rows_read,
        "inserted": inserted,
        "seconds": round(time.time() - started, 2),
    }
    if error == "table_missing":
        result.update(ok=True, skipped="table_missing")
    elif error:
        result["error"] = error
    return result


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def _write_json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _is_authorized(self) -> bool:
        expected = (os.environ.get("CRON_SECRET") or "").strip()
        if not expected:
            return False
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        candidates = [query.get("secret", [""])[0]]
        auth = self.headers.get("Authorization", "") or ""
        if auth.startswith("Bearer "):
            candidates.append(auth[7:])
        return any(c and hmac.compare_digest(c, expected) for c in candidates)

    def do_GET(self):  # noqa: N802 — http.server convention
        if not self._is_authorized():
            self._write_json(401, {"error": "Unauthorized"})
            return
        try:
            result = run_pipeline()
            self._write_json(200 if result.get("ok") else 500, result)
        except Exception as exc:
            self._write_json(500, {"ok": False, "error": f"unhandled: {type(exc).__name__}: {exc}"})
