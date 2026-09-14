"""Which mesoscale frames goes-sync reads, and which detections it keeps
(WHI-907 part 6).

GOES-19 scans each mesoscale sector every minute; goes-sync runs every 10.
Its persistence rule (WHI-546) counts a detection as persistent when an
earlier run saw it too, and WHI-584 does not alert single-frame low-power
detections. To keep "persistent" meaning "seen by two separate looks", a run
reads only the newest frame of each sector and drops the mesoscale detections
of a fire the full-disk scan of the same run already has.
"""
from __future__ import annotations

import math
import re

# Same GOES-R file naming as GLM: _sYYYYJJJHHMMSS + tenths of second.
from glm.extract import key_start

_SECTOR_RE = re.compile(r"OR_ABI-L2-FDCM([12])-M\d+_G\d+_s")
_EARTH_RADIUS_KM = 6371.0


def newest_per_sector(keys: list[str]) -> dict[str, str]:
    """{"M1": key, "M2": key} — the most recent frame of each mesoscale sector."""
    newest: dict[str, tuple] = {}
    for key in keys:
        match = _SECTOR_RE.search(key)
        if not match:
            continue
        try:
            start = key_start(key)
        except ValueError:
            continue
        sector = f"M{match.group(1)}"
        if sector not in newest or start > newest[sector][0]:
            newest[sector] = (start, key)
    return {sector: key for sector, (_, key) in newest.items()}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = rlat2 - rlat1
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def drop_already_detected(primary: list[dict], extra: list[dict], radius_km: float) -> list[dict]:
    """The `extra` detections farther than `radius_km` from every `primary` one."""
    return [
        detection
        for detection in extra
        if all(
            _haversine_km(detection["lat"], detection["lng"], other["lat"], other["lng"]) > radius_km
            for other in primary
        )
    ]
