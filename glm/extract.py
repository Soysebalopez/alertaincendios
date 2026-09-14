"""GOES-19 GLM L2 lightning flash extraction (WHI-907 part 2).

Real file layout (inspected 2026-09-14, s3://noaa-goes19/GLM-L2-LCFA/...):
one file every 20 s with `flash_lat`/`flash_lon` (degrees), `flash_energy`
(J), `flash_area` (m²), `flash_quality_flag` (0 = good quality) and
`flash_time_offset_of_first_event`: an offset in seconds whose base date
lives in its `units` attribute. Open the files with decode_times=False so
that attribute survives; otherwise we refuse to guess the time.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import numpy as np

GOOD_QUALITY = 0
_UNITS_RE = re.compile(r"seconds since (\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?")


def _offset_base(units: str | None) -> datetime:
    match = _UNITS_RE.match((units or "").strip())
    if not match:
        raise ValueError(
            f"flash time offsets need 'seconds since …' units, got {units!r} "
            "(open GLM files with decode_times=False)"
        )
    date, clock, fraction = match.groups()
    base = datetime.strptime(f"{date} {clock}", "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    if fraction:
        base += timedelta(seconds=float(fraction))
    return base


def _iso_ms(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def flashes_in_bbox(ds, bbox: tuple[float, float, float, float]) -> list[dict]:
    """Good-quality flashes inside bbox = (min_lat, min_lng, max_lat, max_lng)."""
    offsets_var = ds["flash_time_offset_of_first_event"]
    base = _offset_base(offsets_var.attrs.get("units"))

    lats = np.asarray(ds["flash_lat"].values, dtype=float)
    if lats.size == 0:
        return []
    lons = np.asarray(ds["flash_lon"].values, dtype=float)
    offsets = np.asarray(offsets_var.values, dtype=float)
    energy = np.asarray(ds["flash_energy"].values, dtype=float)
    area = np.asarray(ds["flash_area"].values, dtype=float)
    quality = np.asarray(ds["flash_quality_flag"].values)

    min_lat, min_lng, max_lat, max_lng = bbox
    keep = (
        (quality == GOOD_QUALITY)
        & (lats >= min_lat) & (lats <= max_lat)
        & (lons >= min_lng) & (lons <= max_lng)
        & np.isfinite(offsets)
    )

    flashes: list[dict] = []
    for i in np.nonzero(keep)[0]:
        flashes.append({
            "flash_at": _iso_ms(base + timedelta(seconds=float(offsets[i]))),
            "lat": round(float(lats[i]), 4),
            "lng": round(float(lons[i]), 4),
            "energy_j": float(energy[i]) if np.isfinite(energy[i]) else None,
            "area_m2": float(area[i]) if np.isfinite(area[i]) else None,
        })
    return flashes
