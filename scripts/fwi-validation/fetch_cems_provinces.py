# scripts/fwi-validation/fetch_cems_provinces.py
"""Download CEMS FWI reanalysis (GRIB) covering an arbitrary set of provinces'
zones and extract FWI at each zone's representative point -> cems_<tag>.csv.

Generalises fetch_cems_patagonia.py to any provinces (reused for each rollout
phase). The AREA is computed from the requested zones' representative points
(+1° margin). Same CEMS quirks as fetch_cems.py (one year/request, FWI only,
unstructured GRIB nearest-point, lon 0-360). Per-year GRIB cached on disk.

    venv/bin/python fetch_cems_provinces.py <tag> <province-id> [province-id ...]
e.g. venv/bin/python fetch_cems_provinces.py cuyo mendoza san-juan san-luis
"""
import sys
import pathlib

import cdsapi
import numpy as np
import xarray as xr
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from fire_danger.zones import ZONES  # noqa: E402

YEARS = [str(y) for y in range(2014, 2023)]
DATASET = "cems-fire-historical-v1"


def request_for_year(year: str, area: list) -> dict:
    return {
        "product_type": "reanalysis",
        "variable": ["fire_weather_index"],
        "dataset_type": "consolidated_dataset",
        "system_version": ["4_1"],
        "year": [year],
        "month": [f"{m:02d}" for m in range(1, 13)],
        "day": [f"{d:02d}" for d in range(1, 32)],
        "grid": "original_grid",
        "data_format": "grib",
        "area": area,
    }


def fetch_year(client, year, area, points, tag):
    path = HERE / f"cems_{tag}_{year}.grib"
    if not path.exists():
        client.retrieve(DATASET, request_for_year(year, area)).download(str(path))
    ds = xr.open_dataset(str(path), engine="cfgrib", backend_kwargs={"indexpath": ""})
    fwi = ds["fwinx"]
    glat = ds.latitude.values
    glon = ds.longitude.values
    times = pd.to_datetime(ds.valid_time.values)
    rows = []
    for name, (lat, lng) in points.items():
        lng360 = lng % 360
        idx = int(np.argmin((glat - lat) ** 2 + (glon - lng360) ** 2))
        series = np.asarray(fwi.isel(values=idx).values)
        for t, val in zip(times, series):
            rows.append({"point": name, "date": pd.Timestamp(t).strftime("%Y-%m-%d"),
                         "fwi_cems": float(val)})
    return rows


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    tag, provinces = sys.argv[1], set(sys.argv[2:])
    points = {z.id: (z.lat, z.lng) for z in ZONES if z.province in provinces}
    if not points:
        print(f"No zones for provinces {provinces}"); sys.exit(1)
    lats = [p[0] for p in points.values()]
    lngs = [p[1] for p in points.values()]
    area = [max(lats) + 1.0, min(lngs) - 1.0, min(lats) - 1.0, max(lngs) + 1.0]  # N,W,S,E
    print(f"{len(points)} zones, area (N,W,S,E)={[round(a,1) for a in area]}")
    client = cdsapi.Client()
    all_rows = []
    for y in YEARS:
        print(f"processing {y}...", flush=True)
        all_rows += fetch_year(client, y, area, points, tag)
    df = pd.DataFrame(all_rows).dropna(subset=["fwi_cems"])
    out = HERE / f"cems_{tag}.csv"
    df.to_csv(out, index=False)
    print(f"wrote {out}: {len(df)} rows, {df['point'].nunique()} zones")


if __name__ == "__main__":
    main()
