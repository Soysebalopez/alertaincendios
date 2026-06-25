"""Map an FWI value to a danger class. Per-zone calibrated cuts (p30/p70/p90/p97
of the zone's own ~10yr FWI distribution) live in danger_thresholds.json, baked
offline by scripts/fwi-validation/calibrate.py. A zone without calibration falls
back to the global provisional thresholds — so the engine never breaks if the
JSON is missing or a zone is new."""
from __future__ import annotations

import functools
import json
import pathlib

DANGER_CLASSES = ["bajo", "moderado", "alto", "muy alto", "extremo"]

# Absolute minimum FWI for each class to be physically meaningful (generic Canadian
# FWI danger breakpoints). Two roles:
#  1. Fallback thresholds for an uncalibrated/missing zone (used below).
#  2. A FLOOR on the per-zone percentile cuts at calibration time
#     (scripts/fwi-validation/calibrate.py): cut = max(zone_percentile, floor). This
#     stops the percentile calibration from labelling trivially-low FWI as "alto" in
#     intrinsically wet, low-danger zones (e.g. Andean forest where >30% of days are
#     FWI 0, so p30=0 collapses "bajo"). Estepa / dry zones sit far above the floor,
#     so their per-zone calibration is unaffected.
GLOBAL_FLOOR = {"moderado": 5.0, "alto": 10.0, "muy alto": 21.0, "extremo": 30.0}

# Global provisional lower-bound thresholds (FWI >= bound -> class). Fallback only.
_THRESHOLDS = [
    (GLOBAL_FLOOR["extremo"], "extremo"),
    (GLOBAL_FLOOR["muy alto"], "muy alto"),
    (GLOBAL_FLOOR["alto"], "alto"),
    (GLOBAL_FLOOR["moderado"], "moderado"),
    (0.0, "bajo"),
]

_THRESHOLDS_PATH = pathlib.Path(__file__).resolve().parent / "danger_thresholds.json"


@functools.lru_cache(maxsize=1)
def _calibrated() -> dict:
    """Per-zone calibrated cuts, or {} if the JSON is absent. Cached for the
    process; tests monkeypatch this function directly."""
    if not _THRESHOLDS_PATH.exists():
        return {}
    return json.loads(_THRESHOLDS_PATH.read_text())


def danger_class(fwi_value: float, zone_id: str | None = None) -> str:
    cal = _calibrated().get(zone_id) if zone_id else None
    if cal:
        ordered = [(cal["extremo"], "extremo"), (cal["muy alto"], "muy alto"),
                   (cal["alto"], "alto"), (cal["moderado"], "moderado")]
        for bound, label in ordered:
            if fwi_value >= bound:
                return label
        return "bajo"
    for bound, label in _THRESHOLDS:
        if fwi_value >= bound:
            return label
    return "bajo"
