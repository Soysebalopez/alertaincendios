#!/usr/bin/env python3
"""
WHI-548 — GLM-L2-LCFA viability spike for CLARA.

Goal: verify that we can replace OpenWeather Lightning API with GOES-19's
GLM (Geostationary Lightning Mapper) feed. Compare:
  - Latency: GLM publishes every 20s
  - Volume: how many flashes/hour over Argentina
  - Format: NetCDF parsing complexity vs current OpenWeather REST

Usage:
  python spike.py             # last ~3 min of GLM (10 files)
  python spike.py --files 30  # ~10 min coverage
"""
import argparse
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3
import numpy as np
import xarray as xr
from botocore import UNSIGNED
from botocore.client import Config

BUCKET = "noaa-goes19"
PRODUCT = "GLM-L2-LCFA"

# Argentina bounding box (with padding, same as FDCF spike)
ARG_BBOX = {"min_lat": -56.0, "max_lat": -21.0, "min_lng": -75.0, "max_lng": -53.0}

OUT_DIR = Path(__file__).parent / "out"
OUT_DIR.mkdir(exist_ok=True)


def s3_client():
    return boto3.client("s3", config=Config(signature_version=UNSIGNED))


def list_recent_keys(client, n_files: int):
    """Return the N most recent GLM-L2-LCFA object keys, newest first."""
    now = datetime.now(timezone.utc)
    keys: list[str] = []
    for delta in range(0, 6):
        t = now - timedelta(hours=delta)
        prefix = f"{PRODUCT}/{t.year}/{t.timetuple().tm_yday:03d}/{t.hour:02d}/"
        resp = client.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
        for o in sorted(resp.get("Contents", []), key=lambda x: x["Key"], reverse=True):
            keys.append(o["Key"])
            if len(keys) >= n_files:
                return keys
    return keys


def analyze_file(client, key: str) -> dict:
    local = OUT_DIR / Path(key).name
    if not local.exists():
        client.download_file(BUCKET, key, str(local))
    ds = xr.open_dataset(local)

    # GLM stores flashes as flat 1D arrays
    flash_lat = ds["flash_lat"].values
    flash_lon = ds["flash_lon"].values
    flash_energy = ds["flash_energy"].values  # joules
    flash_quality = ds["flash_quality_flag"].values  # 0 = good

    total = len(flash_lat)
    good = int((flash_quality == 0).sum())

    in_arg = (
        (flash_lat >= ARG_BBOX["min_lat"]) & (flash_lat <= ARG_BBOX["max_lat"]) &
        (flash_lon >= ARG_BBOX["min_lng"]) & (flash_lon <= ARG_BBOX["max_lng"])
    )
    arg_total = int(in_arg.sum())
    arg_good = int(((flash_quality == 0) & in_arg).sum())

    return {
        "file": local.name,
        "size_kb": round(local.stat().st_size / 1024, 1),
        "total_flashes": total,
        "good_quality_flashes": good,
        "argentina_flashes": arg_total,
        "argentina_good_quality": arg_good,
        "argentina_energy_avg_J": float(flash_energy[in_arg].mean()) if arg_total else 0.0,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", type=int, default=10, help="Number of GLM files to inspect")
    args = parser.parse_args()

    print(f"== GLM-L2-LCFA spike — last {args.files} files ==")
    print(f"   bbox: lat[{ARG_BBOX['min_lat']}, {ARG_BBOX['max_lat']}], "
          f"lng[{ARG_BBOX['min_lng']}, {ARG_BBOX['max_lng']}]")

    t0 = time.time()
    client = s3_client()
    keys = list_recent_keys(client, args.files)
    print(f"\n→ {len(keys)} files found in {time.time() - t0:.1f}s")

    if not keys:
        print("No GLM files found in the last 6 hours. Aborting.")
        return

    t1 = time.time()
    rows = [analyze_file(client, k) for k in keys]
    t_all = time.time() - t1

    arg_sum = sum(r["argentina_flashes"] for r in rows)
    arg_good_sum = sum(r["argentina_good_quality"] for r in rows)
    total_sum = sum(r["total_flashes"] for r in rows)
    bytes_sum = sum(r["size_kb"] for r in rows)

    # Each GLM file covers 20 seconds, so N files = 20N seconds of coverage
    coverage_sec = 20 * len(keys)
    flashes_per_hour_arg = arg_good_sum * 3600 / coverage_sec if coverage_sec else 0

    print(f"\nResults across {len(keys)} files ({coverage_sec}s of coverage):")
    print(f"  Total flashes globally: {total_sum:,}")
    print(f"  Argentina flashes (any quality): {arg_sum:,}")
    print(f"  Argentina good-quality flashes: {arg_good_sum:,}")
    print(f"  Estimated flashes/hour over Argentina: {flashes_per_hour_arg:.0f}")
    print(f"  Avg file size: {bytes_sum / len(keys):.1f} KB")
    print(f"  Total bytes downloaded: {bytes_sum:.1f} KB")
    print(f"  Total time: {time.time() - t0:.1f}s (downloads + parse: {t_all:.1f}s)")

    print("\nPer-file detail:")
    for r in rows[:10]:
        print(f"  {r['file'][-40:]}  total={r['total_flashes']:>4}  "
              f"ARG={r['argentina_flashes']:>3}  ARG_good={r['argentina_good_quality']:>3}")


if __name__ == "__main__":
    main()
