"""
WHI-907 part 2 — real lightning flashes from GOES-19 GLM over Argentina.

Triggered by Supabase pg_cron every 5 minutes (scheduled after merge,
checkpoint C5). Reads the GLM L2 files (one every 20 s) published in the last
WINDOW_MINUTES, keeps good-quality flashes inside Argentina and upserts them
into `lightning_flashes`. Until the migration is approved (checkpoint C2) the
table does not exist: the endpoint answers 200 with skipped="table_missing".

URL: GET /api/glm-sync?secret=<CRON_SECRET>
Env vars: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
SUPABASE_SERVICE_ROLE_KEY.

All data handling lives in `glm.extract` (tested in tests/python); this file
only lists, downloads and writes.
"""
from __future__ import annotations

import hmac
import json
import os
import tempfile
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

import boto3
import requests
import xarray as xr
from botocore import UNSIGNED
from botocore.client import Config

from glm import extract

BUCKET = "noaa-goes19"
WINDOW_MINUTES = 6  # the cron runs every 5 min; duplicates from the overlap are ignored
ARGENTINA_BBOX = (-56.0, -74.0, -21.0, -53.0)  # (min_lat, min_lng, max_lat, max_lng)
TABLE = "lightning_flashes"
HEARTBEAT_KEY = "glm_last_sync_at"
TABLE_MISSING_MARKERS = ("PGRST205", "42P01")
# Explicit timeouts so one stalled S3 connection cannot hold the function until
# Vercel kills it; the cron comes back in 5 minutes anyway.
S3_CONFIG = Config(
    signature_version=UNSIGNED,
    connect_timeout=10,
    read_timeout=30,
    retries={"max_attempts": 3, "mode": "standard"},
)


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


def read_flashes(client, keys: list[str]) -> list[dict]:
    flashes: list[dict] = []
    for key in keys:
        with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
            path = tmp.name
        try:
            client.download_file(BUCKET, key, path)
            with xr.open_dataset(path, decode_times=False) as ds:
                flashes.extend(extract.flashes_in_bbox(ds, ARGENTINA_BBOX))
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
    return flashes


def upsert(rows: list[dict]) -> tuple[int, str | None]:
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        return 0, "missing_supabase_env"
    if not rows:
        return 0, None
    resp = requests.post(
        f"{url.rstrip('/')}/rest/v1/{TABLE}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=ignore-duplicates,return=minimal",
        },
        json=rows,
        timeout=30,
    )
    if resp.status_code in (200, 201, 204):
        return len(rows), None
    if any(marker in resp.text for marker in TABLE_MISSING_MARKERS):
        return 0, "table_missing"
    return 0, f"supabase_status_{resp.status_code}: {resp.text[:200]}"


def write_heartbeat(now: datetime) -> str | None:
    """Record a successful run in `_clara_config`. Lightning alerts trust
    "no flashes near you" only while this is recent: a quiet sky and a dead
    sync would otherwise look the same (both write zero flashes)."""
    url = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        return "missing_supabase_env"
    stamp = now.isoformat()
    resp = requests.post(
        f"{url.rstrip('/')}/rest/v1/_clara_config?on_conflict=key",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=[{"key": HEARTBEAT_KEY, "value": stamp, "updated_at": stamp}],
        timeout=15,
    )
    return None if resp.status_code in (200, 201, 204) else f"heartbeat_status_{resp.status_code}"


def run_pipeline(now: datetime | None = None) -> dict:
    started = time.time()
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(minutes=WINDOW_MINUTES)
    client = boto3.client("s3", config=S3_CONFIG)

    keys = extract.keys_since(list_keys(client, extract.hour_prefixes(since, now)), since)
    flashes = read_flashes(client, keys)
    unique = list({(f["flash_at"], f["lat"], f["lng"]): f for f in flashes}.values())
    inserted, error = upsert(unique)
    # No heartbeat while the table is missing: alerts must keep using the
    # forecast-based fallback until real flashes can actually be stored.
    heartbeat_error = write_heartbeat(now) if error is None and keys else None

    result = {
        "ok": error is None and heartbeat_error is None,
        "files_read": len(keys),
        "flashes_argentina": len(unique),
        "inserted": inserted,
        "seconds": round(time.time() - started, 2),
    }
    if error == "table_missing":
        result.update(ok=True, skipped="table_missing")
    elif error:
        result["error"] = error
    elif heartbeat_error:
        result["error"] = heartbeat_error
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
