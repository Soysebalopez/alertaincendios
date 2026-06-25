# scripts/fwi-validation/build_grids.py
"""Build the per-zone land grid for FWI spatial precision. OFFLINE, run once.

Generates a 0.2-degree grid inside each zone bbox, drops points over water using
Natural Earth 50m (land minus lakes), and writes fire_danger/grids/<zone>.json
(list of [lat, lng], 4 decimals). Deps live in this validation venv only —
production never imports shapely/shapefile.

Prereqs (see plan Task 3): ne_land/ne_50m_land.shp, ne_lakes/ne_50m_lakes.shp.
"""
import json
import pathlib
import sys

import numpy as np
import shapefile  # pyshp
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.zones import ZONES  # noqa: E402

STEP = 0.2
MAX_POINTS = 10  # Cap per zone. Province-sized boxes (Patagonia) yield hundreds of
                 # points at 0.2deg; the Open-Meteo archive free tier weights a call by
                 # points x variables x days, so a 50-point x 10-year download for 8
                 # zones (~31k weight) exceeds the daily quota (~10k) — multi-day. 10
                 # land points keep the whole rollout inside one day's budget while
                 # still giving a robust zone p95 (2nd-highest of 10, artifact-safe) for
                 # biome-homogeneous province zones. CALIBRATION USES THIS SAME GRID, so
                 # the p95 stays consistent with production (no sampling bias). TDF zones
                 # (32-39 pts) predate this cap and are PRESERVED — build() skips any
                 # grid file that already exists, so re-running never re-shrinks them.
                 # Uniform subsample. Re-densify later with a paid key / multi-day run.
HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "grids"


def _load(shp_path: pathlib.Path):
    sr = shapefile.Reader(str(shp_path))
    return unary_union([shape(s.__geo_interface__) for s in sr.shapes()])


def build(force: bool = False) -> None:
    """Write fire_danger/grids/<zone>.json for every zone missing one. Existing
    grids are kept (they may be calibrated at a different density) unless force=True,
    so the orchestrator can call build() idempotently without clobbering TDF."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [z for z in ZONES if force or not (OUT_DIR / f"{z.id}.json").exists()]
    if not todo:
        print("All grids present; nothing to build (use force=True to rebuild).")
        return
    land = prep(_load(HERE / "ne_land" / "ne_50m_land.shp"))
    lakes = prep(_load(HERE / "ne_lakes" / "ne_50m_lakes.shp"))
    for z in todo:
        s, n, w, e = z.bbox
        pts = []
        for lat in np.arange(s, n + 1e-9, STEP):
            for lng in np.arange(w, e + 1e-9, STEP):
                p = Point(float(lng), float(lat))  # shapely is (x=lng, y=lat)
                if land.contains(p) and not lakes.contains(p):
                    pts.append([round(float(lat), 4), round(float(lng), 4)])
        if len(pts) > MAX_POINTS:
            step = (len(pts) + MAX_POINTS - 1) // MAX_POINTS  # uniform subsample
            pts = pts[::step]
        (OUT_DIR / f"{z.id}.json").write_text(json.dumps(pts))
        print(f"{z.id}: {len(pts)} land points")


if __name__ == "__main__":
    build(force="--force" in sys.argv)
