"""
WHI-545 — GOES-19 FDC fire detection sync endpoint.

Triggered by Supabase pg_cron every 10 min via pg_net HTTP GET. Downloads the
latest GOES-19 ABI-L2-FDCF NetCDF from noaa-goes19, applies WHI-546 filters,
and upserts surviving detections into the `goes_preliminary` Supabase table.

URL: GET /api/goes-sync?secret=<CRON_SECRET>
Auth: matches the existing CRON_SECRET pattern used by /api/alerts and /api/fires/sync.

Env vars required:
  CRON_SECRET                 — same as the rest of CLARA
  SUPABASE_URL                — e.g. https://qmzuwnilehldvobjsbcs.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   — service role (server-side only, never to client)

Bundle size: kept lean by avoiding shapely (point-in-poly inlined) and the
supabase-py client (we POST to PostgREST directly with `requests`).
"""
from __future__ import annotations

import json
import math
import os
import tempfile
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from typing import Iterable

import boto3
import numpy as np
import requests
import xarray as xr
from botocore import UNSIGNED
from botocore.client import Config
from pyproj import Proj

# --- Config ---
BUCKET = "noaa-goes19"
PRODUCT = "ABI-L2-FDCF"

HIGH_CONFIDENCE_CODES = {10, 11, 13, 30, 31, 33}
FIRE_CODES = {10, 11, 12, 13, 14, 15, 30, 31, 32, 33, 34, 35}
MASK_LABELS = {
    10: "fire_good_quality", 11: "fire_saturated", 12: "fire_cloud_contaminated",
    13: "fire_high_probability", 14: "fire_medium_probability", 15: "fire_low_probability",
    30: "tf_fire_good_quality", 31: "tf_fire_saturated", 32: "tf_fire_cloud_contaminated",
    33: "tf_fire_high_probability", 34: "tf_fire_medium_probability", 35: "tf_fire_low_probability",
}

# Simplified Argentina polygon (lng, lat) clockwise from NW.
# Production note: swap for GADM ADM0 when we have time.
ARGENTINA_VERTICES = [
    (-67.0, -22.0), (-65.5, -22.0), (-62.0, -22.0), (-58.0, -22.0),
    (-55.0, -25.0), (-53.5, -27.0),
    (-55.5, -28.0), (-58.0, -32.5), (-58.4, -34.0),
    (-56.5, -38.0), (-62.5, -42.0), (-65.0, -45.0), (-68.0, -50.0),
    (-68.5, -53.0),
    (-69.5, -55.0), (-71.0, -55.0),
    (-71.5, -52.0), (-72.0, -48.0), (-71.5, -45.0), (-71.5, -40.0),
    (-70.5, -36.0), (-70.0, -33.0), (-69.5, -30.0), (-69.0, -27.0),
    (-68.0, -25.0), (-67.0, -22.0),
]

URBAN_ZONES = [
    # (name, min_lat, max_lat, min_lng, max_lng)
    ("AMBA",          -35.10, -34.30, -58.95, -57.85),
    ("Gran Cordoba",  -31.60, -31.20, -64.40, -64.00),
    ("Gran Rosario",  -33.05, -32.80, -60.85, -60.55),
    ("Gran Mendoza",  -33.10, -32.80, -68.95, -68.65),
    ("Gran La Plata", -35.00, -34.80, -58.05, -57.80),
    ("S.M. Tucuman",  -26.95, -26.70, -65.30, -65.10),
    ("Mar del Plata", -38.10, -37.90, -57.65, -57.45),
]

DEDUP_RADIUS_KM = 4.0
PERSISTENCE_WINDOW_MIN = 25  # WHI-546 v2: look back for matching detections
PERSISTENCE_RADIUS_KM = 4.0
EARTH_RADIUS_KM = 6371.0

# WHI-583 — oil & gas basins where low-power detections are most likely
# gas flaring, not wildfire. Port from src/lib/fire-classification.ts.
# bbox tuple: (name, south, north, west, east)
OIL_BASINS = [
    ("Cuenca Neuquina (Vaca Muerta)", -40.5, -36.0, -71.0, -67.0),
    ("Golfo San Jorge",               -47.5, -44.0, -70.5, -65.0),
    ("Cuenca Austral",                -54.5, -51.0, -70.5, -67.0),
    ("Cuenca Cuyana",                 -35.0, -32.5, -69.5, -67.0),
]
FLARING_FRP_THRESHOLD_MW = 7.0  # same threshold as FIRMS pipeline

# WHI-583 — known agricultural-burn zones. Detections inside these
# fire-prone areas are *not* dropped, just flagged so downstream
# consumers (e.g. alerting) can deprioritize. Generous bboxes.
AGRICULTURAL_ZONES = [
    ("Pampa cereal/soja",     -37.0, -32.0, -65.0, -58.0),
    ("Tucuman-Salta cañera",  -28.0, -25.0, -65.5, -63.5),
    ("Chaco soja",            -28.0, -23.0, -63.0, -58.0),
]


# --- Filter helpers (inlined from scripts/goes-spike/filters.py) ---
def point_in_polygon(lng: float, lat: float, poly: list[tuple[float, float]]) -> bool:
    """Ray casting algorithm. Polygon is a closed ring of (lng, lat) tuples."""
    n = len(poly)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def in_any_urban(lat: float, lng: float) -> bool:
    for _, min_lat, max_lat, min_lng, max_lng in URBAN_ZONES:
        if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
            return True
    return False


def is_likely_flaring(lat: float, lng: float, frp_mw: float | None) -> bool:
    """WHI-583 — flag low-FRP detection inside an oil basin as flaring."""
    if frp_mw is None or frp_mw > FLARING_FRP_THRESHOLD_MW:
        return False
    for _, south, north, west, east in OIL_BASINS:
        if south <= lat <= north and west <= lng <= east:
            return True
    return False


def in_agricultural_zone(lat: float, lng: float) -> bool:
    """WHI-583 — true if detection falls inside a known burn-prone agricultural area."""
    for _, south, north, west, east in AGRICULTURAL_ZONES:
        if south <= lat <= north and west <= lng <= east:
            return True
    return False


# --- GOES download + parse ---
def s3_client():
    return boto3.client("s3", config=Config(signature_version=UNSIGNED))


def latest_object_key(client) -> str | None:
    now = datetime.now(timezone.utc)
    for delta in range(0, 4):
        t = now - timedelta(hours=delta)
        prefix = f"{PRODUCT}/{t.year}/{t.timetuple().tm_yday:03d}/{t.hour:02d}/"
        resp = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
        contents = resp.get("Contents", [])
        if contents:
            return max(contents, key=lambda o: o["Key"])["Key"]
    return None


def project_pixels(ds, y_idx, x_idx):
    proj_info = ds["goes_imager_projection"]
    sat_h = float(proj_info.attrs["perspective_point_height"])
    lon_origin = float(proj_info.attrs["longitude_of_projection_origin"])
    sweep = proj_info.attrs["sweep_angle_axis"]
    x_rad = ds["x"].values[x_idx]
    y_rad = ds["y"].values[y_idx]
    proj = Proj(proj="geos", h=sat_h, lon_0=lon_origin, sweep=sweep)
    lons, lats = proj(x_rad * sat_h, y_rad * sat_h, inverse=True)
    return lats, lons


def extract_filtered_detections(nc_path: str) -> tuple[list[dict], str]:
    ds = xr.open_dataset(nc_path)
    scan_start = ds.attrs.get("time_coverage_start", "")
    mask_raw = ds["Mask"].values
    valid = ~np.isnan(mask_raw)
    mask_int_2d = np.where(valid, mask_raw, -1).astype(np.int32)

    # Step 1 — mask filter (cheap; cuts 99%+ of the array)
    fire_mask_2d = np.isin(mask_int_2d, list(HIGH_CONFIDENCE_CODES))
    y_idx, x_idx = np.where(fire_mask_2d)
    if len(y_idx) == 0:
        return [], scan_start

    # Project the (small) set of fire pixels
    lats, lons = project_pixels(ds, y_idx, x_idx)
    masks = mask_int_2d[y_idx, x_idx]
    power = ds["Power"].values[y_idx, x_idx]
    area = ds["Area"].values[y_idx, x_idx]

    # Step 2/3 — Argentina polygon + urban exclusion
    detections: list[dict] = []
    for i, (lat, lng) in enumerate(zip(lats, lons)):
        flat = float(lat)
        flng = float(lng)
        if not point_in_polygon(flng, flat, ARGENTINA_VERTICES):
            continue
        if in_any_urban(flat, flng):
            continue
        m = int(masks[i])
        p = float(power[i]) if not np.isnan(power[i]) else None
        a = float(area[i]) if not np.isnan(area[i]) else None
        # WHI-583 — drop low-FRP detections inside oil basins (likely flaring)
        if is_likely_flaring(flat, flng, p):
            continue
        detections.append({
            "lat": flat,
            "lng": flng,
            "mask": m,
            "mask_label": MASK_LABELS.get(m, f"unknown_{m}"),
            "frp_mw": p,
            "area_m2": a,
            "high_confidence": m in HIGH_CONFIDENCE_CODES,
            # WHI-583 — mark agricultural-zone detections for downstream prioritization
            "agricultural_zone": in_agricultural_zone(flat, flng),
            "scan_start": scan_start,
        })

    # Step 4 — spatial dedup (greedy, high-confidence keeps cluster)
    detections.sort(key=lambda r: 0 if r["high_confidence"] else 1)
    kept: list[dict] = []
    for d in detections:
        if any(haversine_km(d["lat"], d["lng"], k["lat"], k["lng"]) <= DEDUP_RADIUS_KM for k in kept):
            continue
        kept.append(d)
    return kept, scan_start


# --- WHI-546 v2 — temporal persistence ---
def compute_persistence(rows: list[dict], supabase_url: str, supabase_key: str) -> int:
    """For each new detection, count previous detections in goes_preliminary
    within PERSISTENCE_WINDOW_MIN and PERSISTENCE_RADIUS_KM. Update each
    row's `seen_in_scans` accordingly (default already 1 for current scan).

    Returns the number of detections that were promoted to persistent (>=2).
    Best-effort: failures don't abort the upsert.
    """
    if not rows:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=PERSISTENCE_WINDOW_MIN)
    endpoint = (
        f"{supabase_url.rstrip('/')}/rest/v1/goes_preliminary"
        f"?select=lat,lng&detected_at=gte.{cutoff.isoformat()}"
    )
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    try:
        resp = requests.get(endpoint, headers=headers, timeout=15)
        if resp.status_code != 200:
            return 0
        prev = resp.json() or []
    except Exception:
        return 0

    promoted = 0
    for r in rows:
        matches = sum(
            1
            for p in prev
            if haversine_km(r["lat"], r["lng"], p["lat"], p["lng"]) <= PERSISTENCE_RADIUS_KM
        )
        # Each prev row is from a different scan within the window (after dedup
        # within-scan happened upstream). matches >= 1 means at least one previous
        # scan saw it → seen_in_scans = 1 (current) + matches.
        r["seen_in_scans"] = 1 + matches
        if r["seen_in_scans"] >= 2:
            promoted += 1
    return promoted


# --- Supabase write ---
def upsert_to_supabase(rows: Iterable[dict]) -> tuple[int, str | None]:
    # CLARA uses NEXT_PUBLIC_SUPABASE_URL (Next.js convention for the URL).
    # Accept the bare name too, so the function is portable to other repos.
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return 0, "missing_supabase_env"
    payload = list(rows)
    if not payload:
        return 0, None
    endpoint = f"{url.rstrip('/')}/rest/v1/goes_preliminary"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=30)
    if resp.status_code not in (200, 201, 204):
        return 0, f"supabase_status_{resp.status_code}: {resp.text[:200]}"
    return len(payload), None


# --- Main pipeline ---
def run_pipeline() -> dict:
    t0 = time.time()
    client = s3_client()

    s3_key = latest_object_key(client)
    if not s3_key:
        return {"ok": False, "error": "no_recent_scan"}

    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
        local_path = tmp.name
    t_d0 = time.time()
    client.download_file(BUCKET, s3_key, local_path)
    t_download = time.time() - t_d0

    t_p0 = time.time()
    detections, scan_start = extract_filtered_detections(local_path)
    t_process = time.time() - t_p0

    # WHI-546 v2 — compute seen_in_scans before insert.
    # SECURITY: keep the supabase service-role key in a clearly-named local
    # variable, never shadow `s3_key` which gets serialized into the response.
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    promoted = (
        compute_persistence(detections, supabase_url, supabase_key)
        if (supabase_url and supabase_key)
        else 0
    )

    inserted, write_err = upsert_to_supabase(detections)
    try:
        os.unlink(local_path)
    except OSError:
        pass

    return {
        "ok": write_err is None,
        "error": write_err,
        "scan_start": scan_start,
        "s3_key": s3_key,
        "detections_kept": len(detections),
        "inserted": inserted,
        "persistent": promoted,
        "timing_seconds": {
            "download": round(t_download, 2),
            "process": round(t_process, 2),
            "total": round(time.time() - t0, 2),
        },
    }


# --- HTTP handler ---
class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def _write_json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _is_authorized(self) -> bool:
        expected = os.environ.get("CRON_SECRET")
        if not expected:
            return False
        # Query param
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if qs.get("secret", [None])[0] == expected:
            return True
        # Authorization: Bearer <secret>
        auth_header = self.headers.get("Authorization", "") or ""
        if auth_header.startswith("Bearer ") and auth_header[7:] == expected:
            return True
        return False

    def do_GET(self):  # noqa: N802 — http.server convention
        if not self._is_authorized():
            self._write_json(401, {"error": "Unauthorized"})
            return
        try:
            result = run_pipeline()
            status = 200 if result.get("ok") else 500
            self._write_json(status, result)
        except Exception as exc:
            self._write_json(500, {"ok": False, "error": f"unhandled: {type(exc).__name__}: {exc}"})
