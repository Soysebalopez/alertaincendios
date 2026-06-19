# fire_danger/grids/__init__.py
"""Load a zone's pre-baked land grid. Client-safe: no geospatial deps — the grid
was computed offline by scripts/fwi-validation/build_grids.py and committed as
JSON. Callers fall back to the zone's representative point when the grid is empty
(see api/fire-danger-sync.py)."""
from __future__ import annotations

import functools
import json
import pathlib

_GRID_DIR = pathlib.Path(__file__).resolve().parent


@functools.lru_cache(maxsize=None)
def grid_points(zone_id: str) -> tuple[tuple[float, float], ...]:
    """Return the zone's land-grid points as ((lat, lng), ...), or () if no grid
    file exists for the zone."""
    path = _GRID_DIR / f"{zone_id}.json"
    if not path.exists():
        return ()
    raw = json.loads(path.read_text())
    return tuple((float(lat), float(lng)) for lat, lng in raw)
