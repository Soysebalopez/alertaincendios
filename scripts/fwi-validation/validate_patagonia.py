# scripts/fwi-validation/validate_patagonia.py
"""Offline correctness checks for the Phase-1 Patagonia FWI zones — uses ONLY the
data already in om_cache/ (no new Open-Meteo / CDS calls).

A) GRID DEVIATION (50->10 pts): for santa-cruz-estepa we have BOTH the old 49-pt
   cache (2013-2021) and the new 10-pt cache. Recompute the daily zone p95 from
   each and measure how much the 10-pt grid drifts from the 49-pt grid — this
   validates the density cut decided this session.

B) CALIBRATION DISTRIBUTION: for every zone, apply its calibrated cuts to its own
   10-pt p95 series and report the share of days per class. By construction
   (p30/p70/p90/p97) it must be ~30/40/20/7/3; a big departure means a bug.

Run: venv/bin/python validate_patagonia.py
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

from fire_danger import fwi as fwi_eq                 # noqa: E402
from fire_danger.aggregate import aggregate_fwi, percentile  # noqa: E402
from fire_danger.classify import danger_class, _calibrated   # noqa: E402
from fire_danger.openmeteo import DayWeather          # noqa: E402

CACHE = HERE / "om_cache"
SPINUP_DROP = 30


def _load_block(zone_id, year, npts):
    p = CACHE / f"{zone_id}-{year}-{npts}pts.json"
    if not p.exists():
        return None
    raw = json.loads(p.read_text())
    return [[DayWeather(**d) for d in block] for block in raw]


def _point_series(days):
    """Chain FWI for one grid point's daily weather; drop spin-up. -> {date: fwi}."""
    state = fwi_eq.DEFAULT_STATE
    out = []
    for d in days:
        r = fwi_eq.fwi_from_weather(temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
                                    month=d.month, hemisphere="south", prev=state)
        s = r["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        out.append((d.date, r["fwi"]))
    return dict(out[SPINUP_DROP:])


def zone_p95_series(zone_id, years, npts):
    """Daily zone p95 over npts grid points, from cache. -> {date: p95_fwi} or None."""
    per_point = None
    for y in years:
        block = _load_block(zone_id, y, npts)
        if block is None:
            return None
        if per_point is None:
            per_point = [[] for _ in block]
        for i, days in enumerate(block):
            per_point[i].extend(days)
    series = [_point_series(days) for days in per_point]
    dates = sorted(series[0])
    return {d: aggregate_fwi([s[d] for s in series if d in s]) for d in dates}


def check_grid_deviation():
    print("=" * 72)
    print("A) GRID DEVIATION  santa-cruz-estepa  p95(49 pts) vs p95(10 pts), 2013-2021")
    print("=" * 72)
    years = list(range(2013, 2022))  # overlap of both caches
    s49 = zone_p95_series("santa-cruz-estepa", years, 49)
    s10 = zone_p95_series("santa-cruz-estepa", years, 10)
    if not s49 or not s10:
        print("  missing cache (49pt or 10pt) — skip"); return
    common = sorted(set(s49) & set(s10))
    a = [s49[d] for d in common]
    b = [s10[d] for d in common]
    n = len(common)
    mean_abs = sum(abs(x - y) for x, y in zip(a, b)) / n
    bias = sum(y - x for x, y in zip(a, b)) / n  # 10pt - 49pt
    # spearman via scipy if present, else skip
    try:
        from scipy.stats import spearmanr, pearsonr
        sp = spearmanr(a, b).correlation
        pe = pearsonr(a, b)[0]
    except Exception:
        sp = pe = float("nan")
    print(f"  days compared: {n}")
    print(f"  Spearman(49,10): {sp:.4f}  Pearson: {pe:.4f}")
    print(f"  mean |10-49|: {mean_abs:.2f}   mean bias (10-49): {bias:+.2f}")
    print("  percentile cuts of each series (p30/p70/p90/p97):")
    for label, ser in (("49pt", a), ("10pt", b)):
        cuts = [round(percentile(ser, q), 2) for q in (30, 70, 90, 97)]
        print(f"    {label}: {cuts}")
    # class agreement: classify each day by the COMMITTED santa-cruz-estepa cuts
    _calibrated.cache_clear()
    agree = sum(1 for x, y in zip(a, b)
                if danger_class(x, "santa-cruz-estepa") == danger_class(y, "santa-cruz-estepa"))
    print(f"  class agreement (same danger class 49 vs 10): {agree}/{n} = {100*agree/n:.1f}%")


def check_calibration_distribution():
    print()
    print("=" * 72)
    print("B) CALIBRATION DISTRIBUTION per zone (target ~30/40/20/7/3 for bajo..extremo)")
    print("=" * 72)
    thr = json.loads((ROOT / "fire_danger" / "danger_thresholds.json").read_text())
    _calibrated.cache_clear()
    years = list(range(2013, 2023))
    classes = ["bajo", "moderado", "alto", "muy alto", "extremo"]
    for zid in thr:
        # find npts from any cache file for this zone
        files = list(CACHE.glob(f"{zid}-2013-*pts.json"))
        if not files:
            print(f"  {zid:28} (no 10pt cache — skip)"); continue
        npts = int(files[0].stem.split("-")[-1].replace("pts", ""))
        ser = zone_p95_series(zid, years, npts)
        if not ser:
            print(f"  {zid:28} (incomplete cache — skip)"); continue
        vals = list(ser.values())
        counts = {c: 0 for c in classes}
        for v in vals:
            counts[danger_class(v, zid)] += 1
        n = len(vals)
        pct = {c: 100 * counts[c] / n for c in classes}
        dist = "  ".join(f"{c[:3]} {pct[c]:4.1f}%" for c in classes)
        print(f"  {zid:28} n={n}  {dist}")


if __name__ == "__main__":
    check_grid_deviation()
    check_calibration_distribution()
