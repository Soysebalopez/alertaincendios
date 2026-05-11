# WHI-545 spike report — GOES FDC viability for CLARA

**Date:** 2026-05-11
**Goal:** Decide whether building the full GOES pipeline (WHI-545/546/547) is worth the 2-4 weeks of work the ticket estimates.

## TL;DR — GO

Pipeline works end-to-end in **<3 seconds** per scan. Signal is real but noisy as expected. Vercel Hobby plan is feasible. Proceed to production build with the architecture below.

## Findings

### 1. Ticket is outdated — use GOES-19, not GOES-16
- `noaa-goes16/ABI-L2-FDCF/` stops at **2025**. GOES-16 was retired as GOES-East and replaced by GOES-19 in 2025.
- Use `noaa-goes19/ABI-L2-FDCF/` — has 2024/2025/2026 data, 10-min cadence confirmed.
- **Action**: update WHI-545 description to reference GOES-19.

### 2. Performance fits Vercel Hobby comfortably

| Metric | Spike measured | Hobby limit | Headroom |
|---|---|---|---|
| File size | 1.7–2.0 MB | — | — |
| Total pipeline (1 scan) | **2.86s** | 300s timeout | ~100× margin |
| Bandwidth (144 scans/day) | ~288 MB/day, ~8.6 GB/month | 100 GB/month | ~12× margin |
| Memory | ~250 MB peak (xarray) | 1024 MB | ~4× margin |

Timing breakdown (typical scan):
- S3 listing + key resolution: ~0.8s
- Download (1.7 MB): ~1.5s
- Open NetCDF: <0.5s
- Filter + project + write CSV: <0.5s

### 3. Signal is real

Validation with peak-season scan (2025-11-15 18:50 UTC, Patagonia afternoon):

| Metric | Off-season (today) | Peak season (Nov 2025) |
|---|---|---|
| Fire pixels global | 104 | 920 |
| Fire pixels in Argentina (bbox) | 2 | 13 |
| High-confidence (codes 10/11/13/30/31/33) | 1 | 5 (38%) |
| Cloud-contaminated | 1 | 3 (23%) |
| Low-probability | 0 | 5 (38%) |

Detections distributed sensibly across known fire-prone provinces (Jujuy, Catamarca, Santiago del Estero, Mendoza, Neuquén). FRP values 16–101 MW match typical wildfire intensity.

### 4. Quality issues that WHI-546 must address

Real problems seen in the test scan:

1. **Bbox bleeds into Chile/Uruguay**. The west boundary at `-75°` and east at `-53°` includes pixels outside Argentina. Need a real Argentina polygon (e.g., GeoJSON of country borders) instead of bbox.
2. **Likely urban/industrial false positive**: detection at `(-34.88, -58.62)` with `fire_good_quality` and FRP 20 MW — falls in Buenos Aires metro area. CLARA already filters Vaca Muerta gas flaring (per `CLAUDE.md`); the same logic should cover urban heat islands and other known industrial sources.
3. **Same fire detected twice with different mask codes**: pixel `(-27.378, -62.745)` and `(-27.400, -62.742)` are ~2 km apart, the natural FDCF resolution. Spatial dedup at ≤4 km radius needed.
4. **Cosmetic bug**: `area_km2` column actually holds m² (per FDC product spec). Fix in production code.
5. **62% of Argentina detections in peak season are NOT high-confidence**. Filtering by mask code alone is the single biggest noise reducer — this is the bulk of WHI-546.

## Architecture confirmed for WHI-545 production

```
┌──────────────────────┐   every 10 min      ┌─────────────────────────────────┐
│  Supabase pg_cron    │ ─── HTTP GET ─────▶ │  /api/goes-sync (Python 3.13)   │
│  (free, unlimited)   │  (pg_net, like the  │  on Vercel Hobby                 │
│  goes-fetch job      │   existing FIRMS    │  - list latest s3://noaa-goes19 │
└──────────────────────┘   fetch job)        │  - download .nc                 │
                                             │  - parse + project + filter ARG │
                                             │  - dedup + apply mask filters   │
                                             │  - upsert to goes_preliminary   │
                                             └─────────────────────────────────┘
                                                            │
                                                            ▼
                                             ┌─────────────────────────────────┐
                                             │ Supabase tables                 │
                                             │  - goes_preliminary (new)       │
                                             │  - fires_cache (existing FIRMS) │
                                             └─────────────────────────────────┘
```

Why this works on Hobby:
- The 10-min cron is run by **Supabase pg_cron**, not Vercel Cron (Hobby caps at 1/day).
- `/api/goes-sync` is a regular Python Vercel Function with no special config — Fluid Compute, default 300s timeout, default 1024 MB memory.
- Total monthly bandwidth (~9 GB) is 9% of the Hobby quota.

## Recommended next-step ticket order

1. **WHI-546** (filters): polygon Argentina, mask-code filter, dedup, urban/industrial exclusions, FRP threshold. This is the biggest single quality lever — do it before any user-facing alert.
2. **WHI-545 production wiring**: port spike to Vercel Function (Python 3.13 + latest xarray, no version pins), new `goes_preliminary` table, pg_cron job, CRON_SECRET auth.
3. **WHI-547** (UX double confirmation): only after filters give us ratio of preliminary/confirmed worth showing the user.

## WHI-546 — filter pipeline (v1)

Implemented `filters.py` with 4 filters applied in order:

1. **Mask code** — keep only `{10, 11, 13, 30, 31, 33}` (good quality + saturated + high-probability, raw and temporally filtered). Drops ~60% of detections in peak season scans.
2. **Argentina polygon** — simplified country boundary (~25 vertices). Excludes Chile, Uruguay, Brazil, Paraguay, Bolivia, Atlantic. Production should swap for Natural Earth or GADM ADM0.
3. **Urban exclusion** — 7 metro bounding boxes (AMBA, Córdoba, Rosario, Mendoza, La Plata, Tucumán, Mar del Plata) to suppress industrial heat sources.
4. **Spatial dedup** — greedy clustering at 4 km haversine radius. High-confidence detections kept as cluster representatives.

### Funnel measured across 4 historical scans

| Scan (UTC) | Global | Argentina raw | → mask | → polygon | → urban | → dedup | Kept |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-05-11 13:30 (off-season) | 104 | 2 | 1 | 1 | 1 | 1 | 50% |
| 2025-11-15 18:50 (peak ARG) | 920 | 13 | 5 | 2 | 1 | 1 | 8% |
| 2025-11-15 22:50 (peak ARG) | 1,270 | 4 | 2 | 2 | 2 | 2 | 50% |
| 2025-12-20 18:50 (peak ARG) | 214 | 28 | 11 | 9 | 9 | 7 | 25% |

Real wins observed:

- Buenos Aires false positive at `(-34.88, -58.62)` with FRP 20 MW — caught by urban filter.
- Chile detection at `(-35.83, -71.59)` and Uruguay detection at `(-31.71, -53.19)` — caught by polygon.
- 4 spatial duplicates collapsed in the Dec 20 scan (9 → 7).

### Limitations / known gaps (deferred to WHI-546 v2)

- **Simplified polygon** — boundary precision is rough at province edges; ~10-20 km uncertainty. Swap to GADM for production.
- **No agricultural-burn exclusion** — known agricultural zones (Pampa cereal belt, sugar cane in Tucumán-Salta) will still trigger during burn season. Needs ground-truth dataset.
- **No cross-check with weather** — heavy clouds can produce thermal false positives. Open-Meteo lookup per detection would help but adds latency.
- **No temporal persistence** — a single-frame detection has higher false-positive rate than 2-frame. Defer because it adds 10 min latency to first alert, conflicts with the project goal.
- **Urban zones are bboxes, not polygons** — over- or under-includes parts of metros. Use OSM `landuse=residential/industrial` polygons in v2.

## Files in this spike

- `spike.py` — download + parse + write per-scan CSV
- `filters.py` — 4-filter pipeline (WHI-546 v1)
- `evaluate.py` — run filters across N scans, print funnel
- `requirements.txt` — pinned for Python 3.9
- `out/*.csv` — per-detection rows + per-scan survivors
- `out/*_summary.json` — timing + mask breakdown per scan

## Re-run anytime

```bash
cd scripts/goes-spike
source venv/bin/activate
python spike.py                          # latest available scan
python spike.py --at 2025-11-15T18:00    # historical scan
python evaluate.py                       # filter funnel on default panel
python evaluate.py --at 2025-12-20T18:00,2025-11-15T18:00
```
