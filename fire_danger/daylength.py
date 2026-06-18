"""Month-indexed day-length factors for the DMC and DC, per Van Wagner & Pickett
(1985). The published tables are for the Northern hemisphere (~46N); for the
Southern hemisphere (Tierra del Fuego) the month index is shifted by 6 so that
the southern summer uses the northern summer's long-day values."""
from __future__ import annotations

# DMC: effective day length Le, months 1..12 (Northern hemisphere).
_DMC_NORTH = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0]
# DC: day-length factor Lf, months 1..12 (Northern hemisphere).
_DC_NORTH = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6]


def _index(month: int, hemisphere: str) -> int:
    if not 1 <= month <= 12:
        raise ValueError(f"month out of range: {month}")
    if hemisphere == "south":
        return (month + 6 - 1) % 12
    if hemisphere == "north":
        return month - 1
    raise ValueError(f"hemisphere must be 'north' or 'south': {hemisphere!r}")


def dmc_daylength(month: int, hemisphere: str) -> float:
    return _DMC_NORTH[_index(month, hemisphere)]


def dc_daylength(month: int, hemisphere: str) -> float:
    return _DC_NORTH[_index(month, hemisphere)]
