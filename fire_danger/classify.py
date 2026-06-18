"""Map an FWI value to a danger class. Thresholds are PROVISIONAL (Canadian-style
scale) and live in one place so Milestone 4 can recalibrate them against
GWIS/CEMS and the official TDF provincial semaphore without touching logic."""
from __future__ import annotations

DANGER_CLASSES = ["bajo", "moderado", "alto", "muy alto", "extremo"]

# Lower-bound thresholds (FWI >= bound -> class). Provisional; tune in M4.
_THRESHOLDS = [
    (30.0, "extremo"),
    (21.0, "muy alto"),
    (10.0, "alto"),
    (5.0, "moderado"),
    (0.0, "bajo"),
]


def danger_class(fwi_value: float) -> str:
    for bound, label in _THRESHOLDS:
        if fwi_value >= bound:
            return label
    return "bajo"
