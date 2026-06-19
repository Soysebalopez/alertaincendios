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
HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "grids"


def _load(shp_path: pathlib.Path):
    sr = shapefile.Reader(str(shp_path))
    return unary_union([shape(s.__geo_interface__) for s in sr.shapes()])


def build() -> None:
    land = prep(_load(HERE / "ne_land" / "ne_50m_land.shp"))
    lakes = prep(_load(HERE / "ne_lakes" / "ne_50m_lakes.shp"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for z in ZONES:
        s, n, w, e = z.bbox
        pts = []
        for lat in np.arange(s, n + 1e-9, STEP):
            for lng in np.arange(w, e + 1e-9, STEP):
                p = Point(float(lng), float(lat))  # shapely is (x=lng, y=lat)
                if land.contains(p) and not lakes.contains(p):
                    pts.append([round(float(lat), 4), round(float(lng), 4)])
        (OUT_DIR / f"{z.id}.json").write_text(json.dumps(pts))
        print(f"{z.id}: {len(pts)} land points")


if __name__ == "__main__":
    build()
