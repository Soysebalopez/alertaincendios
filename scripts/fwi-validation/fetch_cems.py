"""Download CEMS FWI reanalysis (GRIB) for the TDF area and extract the two
points -> cems_tdf.csv. Reference series to validate our Open-Meteo-based FWI.

Two CEMS quirks handled here:
- Per-request cost limit -> fetch ONE YEAR AT A TIME, FWI only.
- The GRIB grid is UNSTRUCTURED: points live on a `values` dimension (not a
  lat/lon index) and longitudes are in 0-360. So we pick the nearest grid point
  by distance, after converting the target longitude to 0-360.
Run once.
"""
import os
import cdsapi
import numpy as np
import xarray as xr
import pandas as pd

POINTS = {"rio_grande": (-53.7878, -67.7091), "ushuaia": (-54.8019, -68.3029)}
YEARS = ["2014", "2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022"]
DATASET = "cems-fire-historical-v1"
AREA = [-52.5, -69, -55.2, -66]  # [North, West, South, East], covers both points


def request_for_year(year: str) -> dict:
    return {
        "product_type": "reanalysis",
        "variable": ["fire_weather_index"],  # FWI only -> stays under the cost limit
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
    path = f"cems_fwi_{year}.grib"
    if not os.path.exists(path):
        client.retrieve(DATASET, request_for_year(year)).download(path)
    ds = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    fwi = ds["fwinx"]                      # dims (time, values)
    glat = ds.latitude.values             # (n_values,)
    glon = ds.longitude.values            # (n_values,), 0-360
    times = pd.to_datetime(ds.valid_time.values)
    rows = []
    for name, (lat, lng) in POINTS.items():
        lng360 = lng % 360
        d2 = (glat - lat) ** 2 + (glon - lng360) ** 2   # nearest grid point
        idx = int(np.argmin(d2))
        series = np.asarray(fwi.isel(values=idx).values)
        for t, val in zip(times, series):
            rows.append({
                "point": name,
                "date": pd.Timestamp(t).strftime("%Y-%m-%d"),
                "fwi_cems": float(val),
            })
    return rows


if __name__ == "__main__":
    client = cdsapi.Client()
    all_rows: list[dict] = []
    for y in YEARS:
        print(f"processing {y}...", flush=True)
        all_rows += fetch_year(client, y)
    df = pd.DataFrame(all_rows).dropna(subset=["fwi_cems"])
    df.to_csv("cems_tdf.csv", index=False)
    print(f"wrote cems_tdf.csv: {len(df)} rows")
