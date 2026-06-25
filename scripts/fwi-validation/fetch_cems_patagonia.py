# scripts/fwi-validation/fetch_cems_patagonia.py
"""Download CEMS FWI reanalysis (GRIB) covering the Phase-1 Patagonia zones and
extract FWI at each zone's representative point -> cems_patagonia.csv.

Same approach/quirks as fetch_cems.py (one year per request, FWI only, unstructured
GRIB → nearest grid point, lon in 0-360). Reads the CDS/EWDS key from ~/.cdsapirc.
Per-year GRIB is cached on disk (cems_pat_fwi_<year>.grib) so re-runs resume.
"""
import os
import sys
import pathlib

import cdsapi
import numpy as np
import xarray as xr
import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
from fire_danger.zones import ZONES  # noqa: E402

# representative point per NEW (non-TDF) zone
POINTS = {z.id: (z.lat, z.lng) for z in ZONES if z.province != "tierra-del-fuego"}
YEARS = [str(y) for y in range(2014, 2023)]  # CEMS consolidated 2014-2022 (matches TDF window)
DATASET = "cems-fire-historical-v1"
# [North, West, South, East] — covers every representative point with margin
AREA = [-38.0, -73.0, -52.0, -64.0]


def request_for_year(year: str) -> dict:
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
        "area": AREA,
    }


def fetch_year(client: cdsapi.Client, year: str) -> list[dict]:
    path = HERE / f"cems_pat_fwi_{year}.grib"
    if not path.exists():
        client.retrieve(DATASET, request_for_year(year)).download(str(path))
    ds = xr.open_dataset(str(path), engine="cfgrib", backend_kwargs={"indexpath": ""})
    fwi = ds["fwinx"]
    glat = ds.latitude.values
    glon = ds.longitude.values  # 0-360
    times = pd.to_datetime(ds.valid_time.values)
    rows = []
    for name, (lat, lng) in POINTS.items():
        lng360 = lng % 360
        d2 = (glat - lat) ** 2 + (glon - lng360) ** 2
        idx = int(np.argmin(d2))
        gp_lat = float(glat[idx]); gp_lon = ((float(glon[idx]) + 180) % 360) - 180
        series = np.asarray(fwi.isel(values=idx).values)
        for t, val in zip(times, series):
            rows.append({"point": name, "date": pd.Timestamp(t).strftime("%Y-%m-%d"),
                         "fwi_cems": float(val), "cems_lat": round(gp_lat, 3),
                         "cems_lon": round(gp_lon, 3)})
    return rows


if __name__ == "__main__":
    client = cdsapi.Client()
    all_rows: list[dict] = []
    for y in YEARS:
        print(f"processing {y}...", flush=True)
        all_rows += fetch_year(client, y)
    df = pd.DataFrame(all_rows).dropna(subset=["fwi_cems"])
    df.to_csv(HERE / "cems_patagonia.csv", index=False)
    print(f"wrote cems_patagonia.csv: {len(df)} rows, {df['point'].nunique()} zones")
