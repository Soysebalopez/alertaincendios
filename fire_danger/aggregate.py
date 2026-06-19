# fire_danger/aggregate.py
"""Aggregate a zone's per-point FWI values into one number. The zone's danger =
p95 of its points: nearly as sensitive as the max to the worst sector, but
robust to a single border (coast/mountain) artifact pixel. Pure stdlib; shared
by the historical calibration input and the production pipeline so both measure
the same thing."""
from __future__ import annotations


def percentile(values: list[float], q: float) -> float:
    """Linear-interpolation percentile (numpy's default method). q in [0, 100].
    Requires a non-empty list."""
    if not values:
        raise ValueError("percentile of empty list")
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    rank = (q / 100.0) * (len(s) - 1)
    lo = int(rank)
    if lo + 1 >= len(s):
        return s[-1]
    frac = rank - lo
    return s[lo] + frac * (s[lo + 1] - s[lo])


def aggregate_fwi(values: list[float]) -> float:
    """The zone's FWI = p95 of its per-point values."""
    return percentile(values, 95.0)


def leader_index(values: list[float]) -> int:
    """Index of the point whose FWI is closest to the p95 — used to pick a
    consistent set of components (temp/rh/wind/...) that belong to a real point
    rather than mixing independent per-component percentiles."""
    target = aggregate_fwi(values)
    return min(range(len(values)), key=lambda i: abs(values[i] - target))
