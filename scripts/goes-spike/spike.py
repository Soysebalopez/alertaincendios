#!/usr/bin/env python3
"""
WHI-545 spike — Download latest GOES-16 ABI L2 FDCF NetCDF and analyze fire
detections over Argentina.

Standalone: no Supabase / Vercel dependencies. Just measures whether GOES is
usable for CLARA and how much "comission" (false positives) the raw product has.

Run:
  python spike.py                # last available frame, save to out/
  python spike.py --hours-back 1 # 1 hour ago
"""
import argparse
import csv
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import boto3
import numpy as np
import xarray as xr
from botocore import UNSIGNED
from botocore.client import Config
from pyproj import Proj

# NOTE: GOES-16 was retired as GOES-East in 2025 — replaced by GOES-19.
# noaa-goes16 has no 2026 data. Use noaa-goes19 for the operational feed.
BUCKET = "noaa-goes19"
PRODUCT = "ABI-L2-FDCF"  # Full Disk, every 10 min — covers Argentina

# Argentina bbox with small padding
ARG_BBOX = {"min_lat": -56.0, "max_lat": -21.0, "min_lng": -75.0, "max_lng": -53.0}

# GOES FDC Mask codes (per Product Definition & User's Guide rev 6, table 5.1.7-1)
MASK_LABELS = {
    0:   "unprocessed_no_data",
    4:   "unprocessed_cloud",
    10:  "fire_good_quality",
    11:  "fire_saturated",
    12:  "fire_cloud_contaminated",
    13:  "fire_high_probability",
    14:  "fire_medium_probability",
    15:  "fire_low_probability",
    30:  "tf_fire_good_quality",
    31:  "tf_fire_saturated",
    32:  "tf_fire_cloud_contaminated",
    33:  "tf_fire_high_probability",
    34:  "tf_fire_medium_probability",
    35:  "tf_fire_low_probability",
    40:  "good_quality_no_fire",
    50:  "off_earth",
    60:  "unknown_no_fire",
    100: "bowtie_deleted",
    120: "invalid_input",
    127: "missing_input",
    150: "cloud_over_land",
    151: "cloud_saturated",
    152: "cloud_and_saturated_input",
    153: "cloud_and_missing_input",
    155: "cloud_and_bowtie_deleted",
    170: "missing_pixel",
    200: "water_good",
    201: "water_saturated_input",
    205: "water_cloud",
    207: "water_missing_input",
    210: "water_bowtie_deleted",
    215: "water_cloud_and_good_input",
    220: "water_cloud_and_bowtie",
    225: "water_cloud_and_missing_input",
    240: "water_offdisk_or_other",
    245: "water_other",
}
FIRE_CODES = {10, 11, 12, 13, 14, 15, 30, 31, 32, 33, 34, 35}
# Conservative set — what CLARA would alert on without further filtering
HIGH_CONFIDENCE_CODES = {10, 11, 13, 30, 31, 33}

OUT_DIR = Path(__file__).parent / "out"
OUT_DIR.mkdir(exist_ok=True)


def s3_client():
    return boto3.client("s3", config=Config(signature_version=UNSIGNED))


def latest_object_key(client, hours_back: int = 0, at: Optional[datetime] = None) -> str:
    """Find newest .nc under ABI-L2-FDCF/{year}/{doy}/{hour}/, walking backwards."""
    base = at if at is not None else datetime.now(timezone.utc) - timedelta(hours=hours_back)
    for delta in range(0, 4):
        t = base - timedelta(hours=delta)
        prefix = f"{PRODUCT}/{t.year}/{t.timetuple().tm_yday:03d}/{t.hour:02d}/"
        resp = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
        contents = resp.get("Contents", [])
        if contents:
            latest = max(contents, key=lambda o: o["Key"])
            return latest["Key"]
    raise RuntimeError(f"No objects found near {base.isoformat()} under {PRODUCT}/")


def download_object(client, key: str) -> Path:
    local = OUT_DIR / Path(key).name
    if local.exists():
        print(f"  ↳ already downloaded: {local.name}")
        return local
    print(f"  ↳ s3://{BUCKET}/{key}")
    t0 = time.time()
    client.download_file(BUCKET, key, str(local))
    print(f"  ↳ {local.stat().st_size / 1e6:.1f} MB in {time.time() - t0:.1f}s")
    return local


def project_to_latlng(ds, y_idx, x_idx):
    """Convert ABI scan angles to lat/lng using the file's projection params."""
    proj_info = ds["goes_imager_projection"]
    sat_h = float(proj_info.attrs["perspective_point_height"])
    lon_origin = float(proj_info.attrs["longitude_of_projection_origin"])
    sweep = proj_info.attrs["sweep_angle_axis"]

    x_rad = ds["x"].values[x_idx]
    y_rad = ds["y"].values[y_idx]
    proj = Proj(proj="geos", h=sat_h, lon_0=lon_origin, sweep=sweep)
    # Inverse: meters → lon/lat
    lons, lats = proj(x_rad * sat_h, y_rad * sat_h, inverse=True)
    return lats, lons


def analyze(path: Path) -> dict:
    t0 = time.time()
    print(f"\n→ opening {path.name}")
    ds = xr.open_dataset(path)
    t_open = time.time() - t0

    # Scene timestamp (mid-scan)
    scan_start = ds.attrs.get("time_coverage_start", "?")
    scan_end = ds.attrs.get("time_coverage_end", "?")
    print(f"  scan: {scan_start} → {scan_end}")

    mask_raw = ds["Mask"].values  # float with NaN for off-disk pixels
    h, w = mask_raw.shape
    print(f"  grid: {h}×{w} ({h * w / 1e6:.1f}M pixels)")
    valid = ~np.isnan(mask_raw)
    print(f"  valid (non-NaN) pixels: {int(valid.sum()):,} "
          f"({100 * valid.sum() / mask_raw.size:.1f}%)")

    # Mask distribution over valid pixels
    t1 = time.time()
    mask_int = mask_raw[valid].astype(np.int32)
    unique, counts = np.unique(mask_int, return_counts=True)
    print("  mask histogram (valid pixels, top 15):")
    for code, n in sorted(zip(unique, counts), key=lambda x: -x[1])[:15]:
        label = MASK_LABELS.get(int(code), f"unknown_{int(code)}")
        print(f"    {int(code):>4}  {label:<32}  {int(n):>10,}")

    # Fire pixels (any FDC fire category). Build a 2D int mask first to avoid NaN issues.
    mask_int_2d = np.where(valid, mask_raw, -1).astype(np.int32)
    fire_mask_2d = np.isin(mask_int_2d, list(FIRE_CODES))
    y_idx, x_idx = np.where(fire_mask_2d)
    n_fire_global = len(y_idx)
    t_filter_global = time.time() - t1
    print(f"  fire pixels (global, all codes): {n_fire_global:,}")

    if n_fire_global == 0:
        return {"path": str(path), "n_fire_arg": 0, "scan": scan_start}

    # Project only fire pixels to lat/lng
    t2 = time.time()
    lats, lons = project_to_latlng(ds, y_idx, x_idx)
    t_project = time.time() - t2

    # Filter to Argentina bbox
    in_arg = (
        (lats >= ARG_BBOX["min_lat"]) & (lats <= ARG_BBOX["max_lat"]) &
        (lons >= ARG_BBOX["min_lng"]) & (lons <= ARG_BBOX["max_lng"])
    )
    n_fire_arg = int(in_arg.sum())
    print(f"  fire pixels (Argentina): {n_fire_arg:,}")

    if n_fire_arg == 0:
        return {
            "path": str(path),
            "scan_start": scan_start,
            "scan_end": scan_end,
            "n_fire_global": n_fire_global,
            "n_fire_arg": 0,
            "n_high_confidence_arg": 0,
            "argentina_mask_breakdown": {},
            "timing_seconds": {
                "open_nc": round(t_open, 2),
                "filter_global": round(t_filter_global, 2),
                "project": round(t_project, 2),
                "total": round(time.time() - t0, 2),
            },
        }

    # Build per-detection records for Argentina
    power = ds["Power"].values[y_idx, x_idx]
    area = ds["Area"].values[y_idx, x_idx]
    mask_vals = mask_int_2d[y_idx, x_idx]

    records = []
    for i in np.where(in_arg)[0]:
        records.append({
            "lat": float(lats[i]),
            "lng": float(lons[i]),
            "mask": int(mask_vals[i]),
            "mask_label": MASK_LABELS.get(int(mask_vals[i]), "unknown"),
            "frp_mw": float(power[i]) if not np.isnan(power[i]) else None,
            "area_km2": float(area[i]) if not np.isnan(area[i]) else None,
            "high_confidence": int(mask_vals[i]) in HIGH_CONFIDENCE_CODES,
        })

    # Mask breakdown for Argentina detections
    arg_masks = mask_vals[in_arg]
    arg_unique, arg_counts = np.unique(arg_masks, return_counts=True)
    print("  Argentina mask breakdown:")
    for code, n in sorted(zip(arg_unique, arg_counts), key=lambda x: -x[1]):
        label = MASK_LABELS.get(int(code), f"unknown_{int(code)}")
        flag = "★" if int(code) in HIGH_CONFIDENCE_CODES else " "
        print(f"    {flag} {int(code):>3}  {label:<32}  {int(n):>6,}")

    n_high = sum(1 for r in records if r["high_confidence"])
    print(f"  → high-confidence in Argentina: {n_high}/{n_fire_arg} "
          f"({100 * n_high / n_fire_arg:.0f}%)")

    # Save CSV
    csv_path = OUT_DIR / f"{path.stem}_argentina.csv"
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(records[0].keys()))
        w.writeheader()
        w.writerows(records)
    print(f"  ↳ wrote {csv_path.name}")

    return {
        "path": str(path),
        "scan_start": scan_start,
        "scan_end": scan_end,
        "n_fire_global": n_fire_global,
        "n_fire_arg": n_fire_arg,
        "n_high_confidence_arg": n_high,
        "argentina_mask_breakdown": {
            MASK_LABELS.get(int(c), f"unknown_{int(c)}"): int(n)
            for c, n in zip(arg_unique, arg_counts)
        },
        "timing_seconds": {
            "open_nc": round(t_open, 2),
            "filter_global": round(t_filter_global, 2),
            "project": round(t_project, 2),
            "total": round(time.time() - t0, 2),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours-back", type=int, default=0,
                        help="Pull frame from N hours ago (default: latest)")
    parser.add_argument("--at", type=str, default=None,
                        help="Pull frame near ISO timestamp, e.g. 2025-11-15T18:00 (UTC)")
    args = parser.parse_args()

    print(f"== GOES-19 {PRODUCT} spike — Argentina ==")
    print(f"   bbox: lat[{ARG_BBOX['min_lat']}, {ARG_BBOX['max_lat']}], "
          f"lng[{ARG_BBOX['min_lng']}, {ARG_BBOX['max_lng']}]")

    t_total = time.time()
    client = s3_client()

    at = None
    if args.at:
        at = datetime.fromisoformat(args.at).replace(tzinfo=timezone.utc)
        print(f"   target time (UTC): {at.isoformat()}")

    t0 = time.time()
    key = latest_object_key(client, hours_back=args.hours_back, at=at)
    print(f"\n→ frame found in {time.time() - t0:.1f}s")
    print(f"   key: {key}")

    t1 = time.time()
    local = download_object(client, key)
    t_download = time.time() - t1

    summary = analyze(local)
    summary["s3_key"] = key
    summary["timing_seconds"]["download"] = round(t_download, 2)
    summary["timing_seconds"]["total_pipeline"] = round(time.time() - t_total, 2)

    summary_path = OUT_DIR / f"{local.stem}_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    print(f"\n✓ summary → {summary_path}")
    print(f"  total pipeline: {summary['timing_seconds']['total_pipeline']}s")


if __name__ == "__main__":
    main()
