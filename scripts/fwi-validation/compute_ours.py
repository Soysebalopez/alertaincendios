"""Compute OUR FWI over 2014-2023 for the two TDF points by reusing the
fire_danger engine on Open-Meteo Historical -> ours_tdf.csv. Run once."""
import sys
import pathlib
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger import fwi as fwi_eq  # noqa: E402
from fire_danger import openmeteo  # noqa: E402

POINTS = {"rio_grande": (-53.7878, -67.7091), "ushuaia": (-54.8019, -68.3029)}
START, END = "2014-01-01", "2023-12-31"
YEARS = list(range(2014, 2024))
SPINUP_DROP = 30  # days from the first year's start

def compute_point(lat, lng):
    all_days = []
    for year in YEARS:
        start = f"{year}-01-01"
        end = f"{year}-12-31"
        days = openmeteo.fetch_history(lat, lng, start, end)
        all_days.extend(days)

    state = fwi_eq.DEFAULT_STATE
    rows = []
    for d in all_days:
        out = fwi_eq.fwi_from_weather(
            temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
            month=d.month, hemisphere="south", prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        rows.append({"date": d.date, "fwi_ours": round(out["fwi"], 3)})
    return rows[SPINUP_DROP:]

if __name__ == "__main__":
    all_rows = []
    for name, (lat, lng) in POINTS.items():
        print(f"Computing {name}...")
        for r in compute_point(lat, lng):
            all_rows.append({"point": name, **r})
    pd.DataFrame(all_rows).to_csv("ours_tdf.csv", index=False)
    print(f"wrote ours_tdf.csv: {len(all_rows)} rows")
