# scripts/fwi-validation/compare_patagonia.py
"""Validate OUR FWI engine for the Patagonia zones against CEMS reanalysis (the
Canadian-FWI gold standard, Copernicus/ERA5). Single-point vs single-point — the
clean engine check (isolates FWI math + Open-Meteo inputs from the zone p95
aggregation), mirroring the TDF validation.

For each zone: our FWI at the grid point nearest the representative city (from the
existing om_cache) vs CEMS at its nearest grid point to that city (cems_patagonia.csv).
Reports Spearman/Pearson + mean bias (overall and by austral season).

Run AFTER fetch_cems_patagonia.py:  venv/bin/python compare_patagonia.py
"""
import pathlib
import sys

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))

from fire_danger import grids                      # noqa: E402
from fire_danger.zones import ZONES                # noqa: E402
from validate_patagonia import _load_block, _point_series  # noqa: E402
from metrics import compute_metrics                # noqa: E402

YEARS = range(2014, 2023)  # CEMS window
ZONES_NEW = {z.id: z for z in ZONES if z.province != "tierra-del-fuego"}


def our_series_nearest(zone):
    pts = list(grids.grid_points(zone.id))
    gi = min(range(len(pts)),
             key=lambda i: (pts[i][0] - zone.lat) ** 2 + (pts[i][1] - zone.lng) ** 2)
    days = []
    for y in YEARS:
        block = _load_block(zone.id, y, len(pts))
        if block is None:
            return None, None
        days.extend(block[gi])
    return _point_series(days), pts[gi]


def main():
    cems = pd.read_csv(HERE / "cems_patagonia.csv")
    rows = []
    near = {}
    for zid, z in ZONES_NEW.items():
        ser, gp = our_series_nearest(z)
        if ser is None:
            print(f"  {zid}: missing cache — skip"); continue
        near[zid] = gp
        for d, f in ser.items():
            rows.append({"point": zid, "date": d, "fwi_ours": f})
    ours = pd.DataFrame(rows)
    merged = ours.merge(cems[["point", "date", "fwi_cems"]], on=["point", "date"], how="inner")

    print(f"{'zone':28} {'n':>5} {'Spearman':>9} {'Pearson':>8} {'bias':>7}  bias by season")
    worst = 1.0
    results = []
    for zid in ZONES_NEW:
        sub = merged[merged["point"] == zid]
        if len(sub) < 200:
            print(f"  {zid:28} (n={len(sub)} too few)"); continue
        m = compute_metrics(sub)
        worst = min(worst, m["spearman"])
        bs = " ".join(f"{k[:3]}{v:+.1f}" for k, v in sorted(m["bias_by_season"].items()))
        print(f"  {zid:28} {m['n']:>5} {m['spearman']:>9.3f} {m['pearson']:>8.3f} "
              f"{m['mean_bias']:>+7.2f}  {bs}")
        results.append((zid, m))
    print(f"\nworst Spearman across zones: {worst:.3f}")
    print("(TDF reference: rio_grande single-point 0.909, grid-p95 0.899; bias ~+5)")


if __name__ == "__main__":
    main()
