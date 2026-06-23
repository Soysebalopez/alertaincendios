# FWI Province Rollout — Implementation Plan (Phase 1: Patagonia)

> **For agentic workers:** executed inline/autonomously this session. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the `add_province` orchestrator and calibrate Phase-1 (Patagonia) FWI zones, leaving everything committed on a branch WITHOUT publishing to prod (user validates the boxes + publishes next morning).

**Architecture:** Reuse the existing offline pipeline (`build_grids.build`, `compute_ours_grid.compute_zone`, `calibrate.thresholds_from_series`) behind a new orchestrator `add_province.py` that, given a province id, builds grids → fetches 10y Open-Meteo history → computes per-zone percentile thresholds and merges them into `fire_danger/danger_thresholds.json` (preserving existing zones). Zones are added to `fire_danger/zones.py`. No prod/DB changes — `seed_zones` will pick the new zones up on the next sync once published.

**Tech Stack:** Python (validation venv `scripts/fwi-validation/venv`), Open-Meteo archive API, Natural Earth land mask.

**Spec:** `docs/superpowers/specs/2026-06-23-fwi-province-rollout-design.md`

**Env verified:** venv has numpy/pandas/pyshp/shapely/requests; Natural Earth shapefiles present; modules import.

---

## Task 1: Add Phase-1 (Patagonia) zones to `fire_danger/zones.py`

Two zones per province (steppe + Andean forest), bbox = (south, north, west, east). **Approximate boxes — user validates next morning.** Province ids match `argentina-cities.ts` kebab ids.

Zones to add:
- `santa-cruz-estepa` — Estepa (Río Gallegos, Caleta Olivia, Pico Truncado) — bbox (-52.4, -46.0, -72.0, -65.7), center (-51.62, -69.22)
- `santa-cruz-bosque-andino` — Bosque andino SO (El Calafate, El Chaltén) — bbox (-51.0, -46.5, -73.6, -72.0), center (-50.34, -72.27)
- `chubut-estepa` — Estepa (Comodoro Rivadavia, Trelew, Rawson, Pto Madryn) — bbox (-46.0, -42.0, -70.5, -63.6), center (-43.25, -65.31)
- `chubut-bosque-andino` — Bosque andino (Esquel, Trevelin, Lago Puelo) — bbox (-44.0, -42.0, -71.6, -70.5), center (-42.91, -71.32)
- `rio-negro-estepa` — Estepa + Alto Valle (Viedma, Gral Roca, Cipolletti) — bbox (-42.0, -37.5, -70.5, -62.8), center (-39.03, -67.58)
- `rio-negro-bosque-andino` — Bosque andino (Bariloche, El Bolsón) — bbox (-42.0, -40.3, -71.9, -70.5), center (-41.13, -71.31)
- `neuquen-estepa` — Estepa/monte (Neuquén, Zapala, Cutral Có, Chos Malal) — bbox (-41.0, -36.0, -70.7, -68.0), center (-38.90, -70.06)
- `neuquen-bosque-andino` — Bosque andino (San Martín de los Andes, Villa La Angostura, Aluminé) — bbox (-41.0, -38.7, -71.7, -70.7), center (-40.16, -71.35)

- [ ] Append 8 `Zone(...)` entries to `ZONES` in `fire_danger/zones.py`, all `hemisphere="south"`.
- [ ] Verify import: `venv/bin/python -c "from fire_danger.zones import ZONES; print(len(ZONES))"` → 10.

## Task 2: Build `scripts/fwi-validation/add_province.py`

- [ ] Create the orchestrator (reuses `build`, `compute_zone`, `thresholds_from_series`; merges thresholds preserving existing zones; `--force` to recompute; skips zones already in the JSON).
- [ ] Sanity: `venv/bin/python add_province.py --help` runs; dry import OK.

## Task 3: Calibrate Phase-1 zones

For each province, run the orchestrator (builds grids + downloads 10y history + writes thresholds):
- [ ] `venv/bin/python add_province.py santa-cruz`
- [ ] `venv/bin/python add_province.py chubut`
- [ ] `venv/bin/python add_province.py rio-negro`
- [ ] `venv/bin/python add_province.py neuquen`
Expected: `fire_danger/grids/<zone>.json` for each, and 8 new keys in `danger_thresholds.json` with strictly increasing cuts. On 429, the built-in retry/backoff + resumable cache handle it.

## Task 4: Commit + morning summary

- [ ] Commit `zones.py`, `grids/*.json`, `danger_thresholds.json`, `add_province.py`, this plan.
- [ ] Write the morning summary to the handoff: which zones calibrated, the cuts, what to validate, anything that got stuck.
- [ ] Do NOT push to prod / do NOT merge. User validates boxes + publishes.

## Notes / risks
- Boxes are approximate; calibration tolerates this (grid + p95). User validates next morning via the cities each box covers (and `/provincia` render after publish).
- If Open-Meteo rate-limits hard, the resumable cache (`om_cache/`) lets a re-run resume; leave partial progress noted.
- `ZONE_OF` duplication in compute/calibrate `__main__` is untouched (orchestrator bypasses it); cleanup is a follow-on, not needed here.
