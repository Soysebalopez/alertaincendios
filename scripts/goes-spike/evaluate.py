#!/usr/bin/env python3
"""
WHI-546 — run all filters on a set of historical scans and print the funnel.

Reuses spike.py to download + analyze each scan, then applies filters.apply_all
on the resulting Argentina detections.

Usage:
  python evaluate.py            # default panel of 4 scans
  python evaluate.py --at "2025-12-20T18:00,2025-11-15T22:00"
"""
import argparse
import csv
from datetime import datetime, timezone
from pathlib import Path

import filters
import spike

OUT = Path(__file__).parent / "out"

DEFAULT_SCANS = [
    None,                     # latest
    "2025-11-15T18:00",       # peak season Patagonia afternoon
    "2025-11-15T22:00",       # later same day
    "2025-12-20T18:00",       # December peak season
]


def load_csv_records(stem: str):
    """Read the per-scan CSV that spike.analyze() wrote, parse numerics."""
    csv_path = OUT / f"{stem}_argentina.csv"
    if not csv_path.exists():
        return []
    with open(csv_path) as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["lat"] = float(r["lat"])
        r["lng"] = float(r["lng"])
        r["mask"] = int(r["mask"])
        r["high_confidence"] = r["high_confidence"].strip().lower() == "true"
        r["frp_mw"] = float(r["frp_mw"]) if r["frp_mw"] else None
    return rows


def run_one(client, at_str):
    at = None
    if at_str:
        at = datetime.fromisoformat(at_str).replace(tzinfo=timezone.utc)
    key = spike.latest_object_key(client, at=at)
    local = spike.download_object(client, key)
    summary = spike.analyze(local)
    records = load_csv_records(local.stem)
    result = filters.apply_all(records)
    return summary, result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--at", type=str, default=None,
                        help="Comma-separated ISO timestamps. Default: 4 historic scans.")
    args = parser.parse_args()

    targets = DEFAULT_SCANS if not args.at else [s.strip() for s in args.at.split(",")]

    client = spike.s3_client()

    print()
    header = (
        f"{'scan_time (UTC)':<22} "
        f"{'global':>7} {'arg_raw':>8} → "
        f"{'mask':>5} {'poly':>5} {'urban':>6} {'dedup':>6} "
        f"{'kept%':>7}"
    )
    print(header)
    print("-" * len(header))

    rows = []
    for at_str in targets:
        try:
            summary, result = run_one(client, at_str)
        except Exception as e:
            print(f"  ! error on {at_str}: {e}")
            continue
        counts = dict(result["funnel"])
        scan_t = summary.get("scan_start", "?")[:19]
        n_in = counts["input"]
        n_out = counts["spatial_dedup_4km"]
        kept_pct = f"{100 * n_out / n_in:.0f}%" if n_in else "  —  "
        print(
            f"{scan_t:<22} "
            f"{summary.get('n_fire_global', 0):>7} "
            f"{n_in:>8} → "
            f"{counts['mask_high_confidence']:>5} "
            f"{counts['inside_argentina']:>5} "
            f"{counts['exclude_urban']:>6} "
            f"{counts['spatial_dedup_4km']:>6} "
            f"{kept_pct:>7}"
        )
        rows.append({
            "scan_start": scan_t,
            "n_global": summary.get("n_fire_global", 0),
            "n_arg_raw": n_in,
            "after_mask": counts["mask_high_confidence"],
            "after_polygon": counts["inside_argentina"],
            "after_urban": counts["exclude_urban"],
            "after_dedup": counts["spatial_dedup_4km"],
            "survivors": result["survivors"],
        })

    # Save final survivors per scan for inspection
    for r in rows:
        if r["survivors"]:
            out_csv = OUT / f"evaluation_{r['scan_start'].replace(':', '').replace('-', '')}_survivors.csv"
            with open(out_csv, "w", newline="") as f:
                w = csv.DictWriter(
                    f, fieldnames=["lat", "lng", "mask", "mask_label",
                                   "frp_mw", "area_km2", "high_confidence"]
                )
                w.writeheader()
                w.writerows(r["survivors"])
            print(f"  ↳ {out_csv.name}")


if __name__ == "__main__":
    main()
