"""SMN WRF 4 km forecast extraction (WHI-907 part 4).

Real file layout (inspected 2026-09-14, s3://smn-ar-wrf/DATA/WRF/DET/...):
2D `lat`/`lon` coordinates on a Lambert conformal grid (1249×999),
`magViento10` in m/s, `dirViento10` in degrees — the direction the wind blows
FROM, verified against the SAZB METAR (1° and 6° apart at 12Z and 13Z) —
`T2` in °C and `HR2` in percent. Run and lead time come from the file name.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone

import numpy as np

EARTH_RADIUS_KM = 6371.0
_KEY_RE = re.compile(r"WRFDETAR_01H_(\d{8})_(\d{2})_(\d{3})\.nc$")
_MS_UNITS = {"meter / second", "m s-1", "m/s", "m s**-1", "meters per second"}
_KMH_UNITS = {"km/h", "km h-1", "kilometer / hour"}


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_key(key: str) -> tuple[str, str]:
    """(run_at, valid_at) in ISO-8601 UTC from an S3 key such as
    DATA/WRF/DET/2026/09/14/00/WRFDETAR_01H_20260914_00_003.nc"""
    match = _KEY_RE.search(key)
    if not match:
        raise ValueError(f"not an SMN WRF hourly file: {key}")
    day, hour, lead = match.groups()
    run = datetime.strptime(day + hour, "%Y%m%d%H").replace(tzinfo=timezone.utc)
    return _iso(run), _iso(run + timedelta(hours=int(lead)))


def _speed_to_kmh_factor(units: str | None) -> float:
    cleaned = (units or "").strip()
    if cleaned in _MS_UNITS:
        return 3.6
    if cleaned in _KMH_UNITS:
        return 1.0
    raise ValueError(f"unexpected wind speed units: {units!r}")


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def _drop_time(values) -> np.ndarray:
    """The files carry a leading `time` dimension of length 1."""
    array = np.asarray(values, dtype=float)
    return array[0] if array.ndim == 3 else array


def points_near(ds, lat: float, lng: float, radius_km: float) -> list[dict]:
    """Grid cells within `radius_km` of (lat, lng), wind speed in km/h."""
    factor = _speed_to_kmh_factor(ds["magViento10"].attrs.get("units"))
    lats = np.asarray(ds["lat"].values, dtype=float)
    lons = np.asarray(ds["lon"].values, dtype=float)
    speed = _drop_time(ds["magViento10"].values) * factor
    direction = _drop_time(ds["dirViento10"].values)
    temp = _drop_time(ds["T2"].values)
    rh = _drop_time(ds["HR2"].values)

    # Cheap bounding box first, so the 1249×999 grid is not scanned point by point.
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    ys, xs = np.nonzero((np.abs(lats - lat) <= dlat) & (np.abs(lons - lng) <= dlng))

    rows: list[dict] = []
    for y, x in zip(ys, xs):
        if _haversine_km(lat, lng, float(lats[y, x]), float(lons[y, x])) > radius_km:
            continue
        values = (speed[y, x], direction[y, x], temp[y, x], rh[y, x])
        if not all(np.isfinite(v) for v in values):
            continue
        rows.append({
            "lat": round(float(lats[y, x]), 5),
            "lng": round(float(lons[y, x]), 5),
            "wind_kmh": round(float(values[0]), 2),
            "wind_from_deg": round(float(values[1]) % 360.0, 1),
            "temp_c": round(float(values[2]), 2),
            "rh_pct": round(float(values[3]), 1),
        })
    return rows


_S3_PREFIX = "DATA/WRF/DET"


def candidate_run_prefixes(now: datetime, count: int = 3) -> list[str]:
    """S3 prefixes of the `count` most recent 00/12 UTC runs, newest first.
    A run's files are published over several hours, so older runs are kept
    as fallbacks for when the newest one is still incomplete."""
    utc = now.astimezone(timezone.utc)
    run = utc.replace(hour=12 if utc.hour >= 12 else 0, minute=0, second=0, microsecond=0)
    prefixes: list[str] = []
    for _ in range(count):
        prefixes.append(f"{_S3_PREFIX}/{run:%Y/%m/%d/%H}/")
        run -= timedelta(hours=12)
    return prefixes


def pick_run_keys(keys: list[str], max_lead: int) -> list[str]:
    """Keys for leads 0..max_lead of the newest run that has all of them."""
    runs: dict[str, dict[int, str]] = {}
    for key in keys:
        match = _KEY_RE.search(key)
        if not match:
            continue
        day, hour, lead = match.groups()
        runs.setdefault(day + hour, {})[int(lead)] = key
    for run_id in sorted(runs, reverse=True):
        leads = runs[run_id]
        if all(lead in leads for lead in range(max_lead + 1)):
            return [leads[lead] for lead in range(max_lead + 1)]
    return []
