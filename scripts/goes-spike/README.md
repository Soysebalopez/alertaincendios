# GOES-16 FDC spike — WHI-545

Standalone Python script to test if GOES-16 ABI L2 FDCF can detect wildfires
over Argentina with reasonable signal-to-noise. Informs whether the full
pipeline (WHI-545, WHI-546, WHI-547) is worth building.

## What it does

1. Lists newest object in `s3://noaa-goes16/ABI-L2-FDCF/` (anonymous, no AWS account)
2. Downloads the NetCDF (~10–20 MB)
3. Opens with `xarray`, reads the `Mask` variable (fire classification per pixel)
4. Projects fire pixels from GOES scan angles to lat/lng using `pyproj`
5. Filters to Argentina bbox
6. Writes a per-detection CSV and a JSON summary with timing + mask breakdown

## Setup (one-time)

```bash
cd scripts/goes-spike
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
source venv/bin/activate
python spike.py
```

Output lands in `out/`:
- `OR_ABI-L2-FDCF-M6_G16_*.nc` — raw NetCDF (gitignored)
- `*_argentina.csv` — per-detection rows (lat, lng, mask code, FRP, area, high_confidence flag)
- `*_summary.json` — timing + mask histograms

## Reading the results

Key fields in the summary:
- `n_fire_global` — all fire pixels in the full disk
- `n_fire_arg` — fire pixels inside Argentina bbox
- `n_high_confidence_arg` — pixels in `{10, 11, 13, 30, 31, 33}` (good quality / saturated / high-probability)
- `argentina_mask_breakdown` — how many of each mask code
- `timing_seconds` — download / open / filter / project / total

## Decision criteria after running

| Metric | Green | Yellow | Red |
|---|---|---|---|
| Total pipeline time | <30s | 30–120s | >120s (won't fit Vercel timeout) |
| High-confidence ratio | >40% | 10–40% | <10% (too noisy without ML) |
| Detections in Argentina | 1+ per scan | sparse | always 0 (bbox/proj bug) |
