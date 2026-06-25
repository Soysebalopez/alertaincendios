# scripts/fwi-validation/compare_provinces.py
"""Validate OUR FWI engine vs CEMS for an arbitrary set of provinces' zones.

Generalises compare_patagonia.py. Reads cems_<tag>.csv (from
fetch_cems_provinces.py) and our cached FWI at the grid point nearest each zone's
representative city (om_cache, written by add_province). Single-point vs
single-point — the clean engine check. Reports Spearman/Pearson + mean bias.

    venv/bin/python compare_provinces.py <tag> <province-id> [province-id ...]
"""
import sys
import pathlib

import pandas as pd

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1]))

from fire_danger import grids                      # noqa: E402
from fire_danger.zones import ZONES                # noqa: E402
from validate_patagonia import _load_block, _point_series  # noqa: E402
from metrics import compute_metrics                # noqa: E402

YEARS = range(2014, 2023)


def our_series_nearest(zone):
    pts = list(grids.grid_points(zone.id))
    if not pts:
        return None
    gi = min(range(len(pts)),
             key=lambda i: (pts[i][0] - zone.lat) ** 2 + (pts[i][1] - zone.lng) ** 2)
    days = []
    for y in YEARS:
        block = _load_block(zone.id, y, len(pts))
        if block is None:
            return None
        days.extend(block[gi])
    return _point_series(days)


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    tag, provinces = sys.argv[1], set(sys.argv[2:])
    zones = [z for z in ZONES if z.province in provinces]
    cems = pd.read_csv(HERE / f"cems_{tag}.csv")
    rows = []
    for z in zones:
        ser = our_series_nearest(z)
        if ser is None:
            print(f"  {z.id}: missing grid/cache — skip"); continue
        for d, f in ser.items():
            rows.append({"point": z.id, "date": d, "fwi_ours": f})
    ours = pd.DataFrame(rows)
    merged = ours.merge(cems[["point", "date", "fwi_cems"]], on=["point", "date"], how="inner")

    print(f"{'zone':30} {'n':>5} {'Spearman':>9} {'Pearson':>8} {'bias':>7}")
    worst = 1.0
    for z in zones:
        sub = merged[merged["point"] == z.id]
        if len(sub) < 200:
            print(f"  {z.id:30} (n={len(sub)} too few)"); continue
        m = compute_metrics(sub)
        worst = min(worst, m["spearman"])
        print(f"  {z.id:30} {m['n']:>5} {m['spearman']:>9.3f} {m['pearson']:>8.3f} {m['mean_bias']:>+7.2f}")
    print(f"\nworst Spearman: {worst:.3f}  (TDF ref: steppe ~0.90; wet forest ~0.80)")


if __name__ == "__main__":
    main()
