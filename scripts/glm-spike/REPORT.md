# WHI-548 spike — GLM-L2-LCFA viability for CLARA

**Date:** 2026-05-11
**Goal:** Decide whether to migrate dry-storm detection (WHI-543) from OpenWeather Lightning API to GOES-19 GLM, now that we have a working GOES pipeline (WHI-545).

## TL;DR — viable, but **defer** until volume requires it

GLM data is accessible, parseable, and would give us **20-second latency** (vs OpenWeather's polling overhead). But OpenWeather is currently working fine within free-tier limits, and migration adds another Python pipeline to maintain. Park this until CLARA has enough subscribers that OpenWeather's rate limits start to bite, or until WHI-583 v3 (filtros avanzados) lands and we want to consolidate GOES infra.

## Spike results

Ran `spike.py` against the last 10 GLM-L2-LCFA files (200s of coverage):

| Metric | Value |
|---|---|
| Files found in S3 | 10 ✓ |
| Avg file size | 272 KB |
| Parse time per file | ~1.5s |
| Total flashes globally | 1,010 (in 200s) |
| **Flashes over Argentina** | **0** (no storms now — autumn, 15:00 UTC) |
| Bytes downloaded | 2.7 MB |
| Total pipeline (10 files) | 16.5s |

The "0 flashes over Argentina" is expected for the current conditions (otoño, mediodía despejado). The point of the spike is to verify the format and pipeline; volume validation needs a peak-season run.

## Bandwidth + compute math for production

- GLM publishes **180 files/hour** (every 20s)
- @ 270 KB/file → **48.6 MB/hour = 1.2 GB/day = ~35 GB/month**
- Vercel Hobby bandwidth budget: 100 GB/month
- Combined with GOES FDC (~9 GB/mes): total **~44 GB/mes**, leaves 56 GB headroom

**Cron cadence options:**

| Cadence | Files/poll | Files/hour | Bandwidth/mes | Latency to alert |
|---|---|---|---|---|
| Every 20s | 1 | 180 | 35 GB | <40s |
| Every 1 min | 3 | 180 | 35 GB | <60s |
| Every 5 min | 15 | 180 | 35 GB | <5 min |
| Every 10 min | 30 | 180 | 35 GB | <10 min (≈ OpenWeather) |

Pg_cron in Supabase allows minute-level granularity. Sub-minute would need Vercel Cron (Pro plan) or external scheduler.

## Comparison vs current OpenWeather Lightning API

| Dimension | OpenWeather (today) | GLM-L2-LCFA |
|---|---|---|
| Latency | ~minutes (rate-limited polling per subscriber) | 20s native |
| Cost | Free tier (limited calls/day) | Free (NOAA Open Data) |
| Geographic resolution | Per subscriber (point query) | Full continent every file |
| Quality flag | No | Yes (`flash_quality_flag`) |
| Energy per flash | Yes | Yes (`flash_energy` in J) |
| Migration effort | — | ~3-5 days (mirror WHI-545 pipeline) |
| Maintenance | Low (REST) | Higher (NetCDF parsing, S3, cron) |

## Architecture if/when we migrate

Identical pattern to WHI-545:

```
[every 1 min] Supabase pg_cron 'glm-sync'
       │
       ▼
   /api/glm-sync.py (Python Vercel function)
       │ — downloads last ~3 GLM files
       │ — filters flashes to Argentina bbox
       │ — applies polygon + quality filter
       │ — upserts to glm_flashes table
       ▼
   Supabase glm_flashes
       │
       ▼
[every 1 min] /api/glm-alerts (replaces lightning-alerts route)
       │ — finds subscribers within X km of recent flashes
       │ — applies dry-conditions check (humidity, recent rain)
       │ — Telegram alert
```

Schema sketch:

```sql
CREATE TABLE glm_flashes (
  id BIGSERIAL PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  energy_j real,
  flash_time timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT glm_flashes_unique UNIQUE (lat, lng, flash_time)
);
```

## Recommendation

**Don't migrate yet.** Reasons:

1. OpenWeather is delivering useful alerts today (WHI-543 deployed). No user pain reported.
2. Adding another Python pipeline doubles the GOES-style maintenance surface.
3. CLARA is in pre-volume phase — bandwidth and rate-limit pressure aren't binding yet.

**Re-evaluate when one of these triggers:**
- OpenWeather rate-limits start blocking requests (we'd see this in `/api/lightning-alerts` logs).
- Subscriber count crosses ~1000 (current OpenWeather free tier has ~1000 calls/day).
- We migrate to a paid Vercel plan and want to consolidate vendors (NOAA only).
- A real fire incident proves that the 20-second latency advantage would have been actionable (high bar).

When it does happen, the spike above + the WHI-545 pipeline template make this a 3-day implementation, not 2 weeks.

## Files in this spike

- `spike.py` — standalone test (re-uses the goes-spike venv via symlink)
- `out/*.nc` — downloaded GLM files (gitignored)
- `REPORT.md` — this document

## Re-run

```bash
cd scripts/glm-spike
source venv/bin/activate
python spike.py --files 10    # last 200s
python spike.py --files 30    # last 10 min
```
