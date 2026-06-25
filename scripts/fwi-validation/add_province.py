# scripts/fwi-validation/add_province.py
"""Onboard a province's FWI zones: build land grid -> fetch 10y Open-Meteo history
-> calibrate per-zone danger-class thresholds, for every zone of the given province.

Reuses the existing offline pipeline (build_grids.build, compute_ours_grid.compute_zone,
calibrate.thresholds_from_series). Merges the new cuts into
fire_danger/danger_thresholds.json, PRESERVING zones already there. Skips zones that
already have thresholds unless --force. Offline; run with this directory's venv:

    venv/bin/python add_province.py <province-id> [--force]

Zones themselves live in fire_danger/zones.py (curated by hand). This only calibrates
the ones already defined for the given province.
"""
import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))

from fire_danger.zones import ZONES                  # noqa: E402
from build_grids import build as build_all_grids     # noqa: E402
from compute_ours_grid import compute_zone           # noqa: E402
from calibrate import thresholds_from_series         # noqa: E402

THRESHOLDS_PATH = ROOT / "fire_danger" / "danger_thresholds.json"


def main() -> None:
    ap = argparse.ArgumentParser(description="Calibrate FWI danger thresholds for a province's zones.")
    ap.add_argument("province", help="province id, e.g. santa-cruz")
    ap.add_argument("--force", action="store_true",
                    help="recompute even if the zone already has thresholds")
    args = ap.parse_args()

    zones = [z for z in ZONES if z.province == args.province]
    if not zones:
        known = sorted({z.province for z in ZONES})
        print(f"No zones for province '{args.province}'. Add them to fire_danger/zones.py.")
        print(f"Known provinces: {known}")
        sys.exit(1)

    thresholds = {}
    if THRESHOLDS_PATH.exists():
        thresholds = json.loads(THRESHOLDS_PATH.read_text())

    targets = [z for z in zones if args.force or z.id not in thresholds]
    skipped = [z.id for z in zones if z.id in thresholds and not args.force]
    if skipped:
        print(f"Already calibrated (skipping; use --force to redo): {skipped}")
    if not targets:
        print("Nothing to do.")
        return

    # 1. (re)build land grids for all zones (cheap; writes fire_danger/grids/<zone>.json)
    print("Building land grids (Natural Earth land mask)...")
    build_all_grids()

    # 2. per target zone: download 10y history + chain the FWI series (p95 per day)
    series_by_zone = {}
    for z in targets:
        print(f"Computing 10y FWI history for {z.id} ({z.name})...")
        rows = compute_zone(z.id)
        series_by_zone[z.id] = [r["fwi_ours"] for r in rows]
        print(f"  {z.id}: {len(rows)} days")

    # 3. percentile cuts, merged into the JSON (existing zones preserved)
    new_cuts = thresholds_from_series(series_by_zone)
    thresholds.update(new_cuts)
    THRESHOLDS_PATH.write_text(json.dumps(thresholds, indent=2, ensure_ascii=False))
    print(f"\nWrote {THRESHOLDS_PATH} (now {len(thresholds)} zones). New cuts:")
    for zid, cuts in new_cuts.items():
        print(f"  {zid}: {cuts}")


if __name__ == "__main__":
    main()
