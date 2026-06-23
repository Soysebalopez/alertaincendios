"""Cheap check (zero network): is Ushuaia's drop (grid p95 0.655 vs single-point
baseline 0.796) caused by the p95 aggregation — not the engine, not the 2019-2022
window? Reuse the CACHED 39-point blocks: take the grid point nearest Ushuaia
city, compute its SINGLE-point FWI (no p95), and correlate vs CEMS at Ushuaia.

If this lands near the 0.796 baseline, the 0.655 is purely spatial aggregation
over a heterogeneous zone — confirming the engine is fine."""
import sys
import pathlib
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger import fwi as fwi_eq          # noqa: E402
from fire_danger import grids                  # noqa: E402
from fwi_cache import cached_fetch             # noqa: E402
from metrics import align, compute_metrics     # noqa: E402

ZONE = "tdf-sur-bosque"
USHUAIA = (-54.8019, -68.3029)   # representative point used in the single-point baseline
YEARS = list(range(2019, 2023))
SPINUP_DROP = 30
CACHE_DIR = pathlib.Path(__file__).resolve().parent / "om_cache"


def _nearest_index(points, target):
    return min(range(len(points)),
               key=lambda i: (points[i][0] - target[0]) ** 2 + (points[i][1] - target[1]) ** 2)


def _series_for_point(days):
    state = fwi_eq.DEFAULT_STATE
    out = []
    for d in days:
        r = fwi_eq.fwi_from_weather(temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
                                    month=d.month, hemisphere="south", prev=state)
        s = r["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        out.append((d.date, r["fwi"]))
    return out[SPINUP_DROP:]


def _no_fetch():
    raise RuntimeError("cache miss — expected all blocks already cached")


if __name__ == "__main__":
    points = list(grids.grid_points(ZONE))
    idx = _nearest_index(points, USHUAIA)
    print(f"nearest grid point to Ushuaia {USHUAIA}: {points[idx]} (index {idx}/{len(points)})")

    days = []
    for year in YEARS:
        key = f"{ZONE}-{year}-{len(points)}pts"
        blocks = cached_fetch(CACHE_DIR, key, _no_fetch)   # _no_fetch => zero network
        days.extend(blocks[idx])

    series = _series_for_point(days)
    ours = pd.DataFrame([{"point": "ushuaia", "date": d, "fwi_ours": f} for d, f in series])

    cems = pd.read_csv("cems_tdf.csv")
    merged = align(ours, cems[cems["point"] == "ushuaia"])
    m = compute_metrics(merged)
    print(f"single nearest-point vs CEMS — Spearman: {m['spearman']:.3f} · "
          f"Pearson: {m['pearson']:.3f} · bias: {m['mean_bias']:+.2f} · n={m['n']}")
    print(f"  grid-p95 was 0.655 · single-point baseline (2014-2023) was 0.796")
