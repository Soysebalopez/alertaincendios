# FWI Danger-Class Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calibrate the FWI danger classes per zone from each zone's own ~10-year FWI distribution (p30/p70/p90/p97), replacing the global provisional thresholds so a published class means "anomalous for THIS zone".

**Architecture:** A pure function turns a per-zone FWI series into per-zone cut points; an offline script bakes them to a versioned `fire_danger/danger_thresholds.json`. `classify.danger_class(fwi, zone_id)` uses a zone's calibrated cuts when present, else falls back to the global provisional thresholds. The pipeline passes `zone_id` through, so production classes become calibrated once the JSON exists.

**Tech Stack:** Python (stdlib), pytest. Reuses `fire_danger.aggregate.percentile` (linear-interp, already tested) and the resumable cache (`scripts/fwi-validation/fwi_cache.py`).

**Conventions:**
- Engine unit tests: `.venv/bin/python -m pytest tests/python -v` (pytest `pythonpath=.`, `testpaths=tests/python`).
- Validation-script tests: `scripts/fwi-validation/venv/bin/python -m pytest scripts/fwi-validation/test_*.py` (that venv has pytest 9.x + pandas).
- Commit messages: conventional prefix, English, end with the `Co-Authored-By` trailer.
- Task 5 (generate the real series + JSON) is GATED on Open-Meteo quota and is run incrementally via the resumable cache — documentation/steps here, executed by a human/controller.

**Threshold scheme (used throughout):** `bajo` if `fwi < p30`; `moderado` if `p30 ≤ fwi < p70`; `alto` if `p70 ≤ fwi < p90`; `muy alto` if `p90 ≤ fwi < p97`; `extremo` if `fwi ≥ p97`. The JSON stores each class's lower bound:
`{zone_id: {"moderado": p30, "alto": p70, "muy alto": p90, "extremo": p97}}`.

---

### Task 1: `classify.py` — per-zone thresholds with global fallback

The central piece: classification reads calibrated cuts when a zone has them, else the global provisional ones. No network.

**Files:**
- Modify: `fire_danger/classify.py`
- Test: `tests/python/test_classify.py` (append; keep existing tests)

- [ ] **Step 1: Write the failing tests (append to `tests/python/test_classify.py`)**

```python
import fire_danger.classify as classify_mod


def test_calibrated_zone_uses_its_own_cuts(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    assert classify_mod.danger_class(1.0, "z") == "bajo"
    assert classify_mod.danger_class(2.0, "z") == "moderado"
    assert classify_mod.danger_class(6.0, "z") == "alto"
    assert classify_mod.danger_class(9.0, "z") == "muy alto"
    assert classify_mod.danger_class(12.0, "z") == "extremo"


def test_unknown_zone_falls_back_to_global(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    # zone "other" has no calibration -> global cuts (muy alto starts at 21.0)
    assert classify_mod.danger_class(25.0, "other") == "muy alto"


def test_no_zone_id_uses_global(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    assert classify_mod.danger_class(25.0) == "muy alto"   # global, unchanged contract
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/python -m pytest tests/python/test_classify.py -v`
Expected: FAIL — `module 'fire_danger.classify' has no attribute '_calibrated'`.

- [ ] **Step 3: Implement (replace the body of `fire_danger/classify.py`)**

```python
"""Map an FWI value to a danger class. Per-zone calibrated cuts (p30/p70/p90/p97
of the zone's own ~10yr FWI distribution) live in danger_thresholds.json, baked
offline by scripts/fwi-validation/calibrate.py. A zone without calibration falls
back to the global provisional thresholds — so the engine never breaks if the
JSON is missing or a zone is new."""
from __future__ import annotations

import functools
import json
import pathlib

DANGER_CLASSES = ["bajo", "moderado", "alto", "muy alto", "extremo"]

# Global provisional lower-bound thresholds (FWI >= bound -> class). Fallback only.
_THRESHOLDS = [
    (30.0, "extremo"),
    (21.0, "muy alto"),
    (10.0, "alto"),
    (5.0, "moderado"),
    (0.0, "bajo"),
]

_THRESHOLDS_PATH = pathlib.Path(__file__).resolve().parent / "danger_thresholds.json"


@functools.lru_cache(maxsize=1)
def _calibrated() -> dict:
    """Per-zone calibrated cuts, or {} if the JSON is absent. Cached for the
    process; tests monkeypatch this function directly."""
    if not _THRESHOLDS_PATH.exists():
        return {}
    return json.loads(_THRESHOLDS_PATH.read_text())


def danger_class(fwi_value: float, zone_id: str | None = None) -> str:
    cal = _calibrated().get(zone_id) if zone_id else None
    if cal:
        ordered = [(cal["extremo"], "extremo"), (cal["muy alto"], "muy alto"),
                   (cal["alto"], "alto"), (cal["moderado"], "moderado")]
        for bound, label in ordered:
            if fwi_value >= bound:
                return label
        return "bajo"
    for bound, label in _THRESHOLDS:
        if fwi_value >= bound:
            return label
    return "bajo"
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/python -m pytest tests/python/test_classify.py -v`
Expected: PASS (existing 2 + new 3).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/classify.py tests/python/test_classify.py
git commit -m "feat: per-zone calibrated danger classes with global fallback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `calibrate.py` — series → per-zone thresholds

The pure calibration function (percentiles → cuts) plus the offline script that reads the series CSV and bakes the JSON.

**Files:**
- Create: `scripts/fwi-validation/calibrate.py`
- Test: `scripts/fwi-validation/test_calibrate.py`

- [ ] **Step 1: Write the failing test**

```python
# scripts/fwi-validation/test_calibrate.py
from calibrate import thresholds_from_series


def test_thresholds_are_the_four_percentiles_and_monotonic():
    vals = [float(i) for i in range(1, 101)]   # 1..100
    out = thresholds_from_series({"z": vals})
    r = out["z"]
    assert set(r) == {"moderado", "alto", "muy alto", "extremo"}
    assert r["moderado"] < r["alto"] < r["muy alto"] < r["extremo"]
    # percentile(1..100, 97) ≈ 97.03 (linear interp)
    assert 96.0 < r["extremo"] < 98.0
    assert 29.0 < r["moderado"] < 31.0   # p30 ≈ 30.0


def test_raises_on_non_monotonic_series():
    import pytest
    # all-equal series -> percentiles collapse, not strictly increasing
    with pytest.raises(ValueError):
        thresholds_from_series({"z": [5.0] * 100})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd scripts/fwi-validation && venv/bin/python -m pytest test_calibrate.py -v && cd ../..`
Expected: FAIL — `No module named 'calibrate'`.

- [ ] **Step 3: Implement `scripts/fwi-validation/calibrate.py`**

```python
# scripts/fwi-validation/calibrate.py
"""Calibrate per-zone FWI danger-class cuts (p30/p70/p90/p97) from each zone's
own historical FWI series, and bake fire_danger/danger_thresholds.json. Offline,
run once (after the series CSV exists). Pure function thresholds_from_series is
unit-tested; the __main__ wiring reads the series and writes the JSON."""
import json
import pathlib
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.aggregate import percentile  # noqa: E402

# validation point name -> production zone id (mirrors compute_ours_grid.ZONE_OF)
ZONE_OF = {"rio_grande": "tdf-norte-estepa", "ushuaia": "tdf-sur-bosque"}
OUT_PATH = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "danger_thresholds.json"


def thresholds_from_series(series_by_zone: dict) -> dict:
    """series_by_zone: {zone_id: [fwi values]} -> {zone_id: {class: lower_bound}}.
    Raises ValueError if a zone's percentiles are not strictly increasing."""
    out = {}
    for zone_id, values in series_by_zone.items():
        p30, p70, p90, p97 = (percentile(list(values), q) for q in (30.0, 70.0, 90.0, 97.0))
        if not (p30 < p70 < p90 < p97):
            raise ValueError(f"non-monotonic percentiles for {zone_id}: {(p30, p70, p90, p97)}")
        out[zone_id] = {"moderado": round(p30, 2), "alto": round(p70, 2),
                        "muy alto": round(p90, 2), "extremo": round(p97, 2)}
    return out


if __name__ == "__main__":
    df = pd.read_csv("ours_tdf.csv")   # columns: point, date, fwi_ours
    series = {ZONE_OF[p]: g["fwi_ours"].tolist()
              for p, g in df.groupby("point") if p in ZONE_OF}
    thresholds = thresholds_from_series(series)
    OUT_PATH.write_text(json.dumps(thresholds, indent=2, ensure_ascii=False))
    print(f"wrote {OUT_PATH}")
    for zid, cuts in thresholds.items():
        n = len(series[zid])
        print(f"  {zid}: n={n} days · {cuts}")
```

- [ ] **Step 4: Run to verify pass**

Run: `cd scripts/fwi-validation && venv/bin/python -m pytest test_calibrate.py -v && cd ../..`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add scripts/fwi-validation/calibrate.py scripts/fwi-validation/test_calibrate.py
git commit -m "feat: per-zone FWI threshold calibration (percentiles -> JSON)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pipeline wiring — propagate `zone_id` to `danger_class`

**Files:**
- Modify: `fire_danger/pipeline.py`
- Test: `tests/python/test_pipeline.py` (append)

- [ ] **Step 1: Write the failing test (append to `tests/python/test_pipeline.py`)**

```python
def test_grid_forecast_applies_zone_calibration(monkeypatch):
    import fire_danger.classify as classify_mod
    # calibrated cuts where everything >= 0 is "extremo"
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 0.0, "alto": 0.0, "muy alto": 0.0, "extremo": 0.0}})
    forecast = [_day("2026-06-18", 10.0, 90.0, 5.0)]   # low-danger day
    start = (85.0, 6.0, 15.0)
    cal, _ = compute_zone_forecast_grid([forecast], [start], hemisphere="south", zone_id="z")
    base, _ = compute_zone_forecast_grid([forecast], [start], hemisphere="south")
    assert cal[0]["danger_class"] == "extremo"      # calibrated zone z
    assert base[0]["danger_class"] != "extremo"     # global fallback on a calm day
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/python/test_pipeline.py::test_grid_forecast_applies_zone_calibration -v`
Expected: FAIL — `compute_zone_forecast_grid() got an unexpected keyword argument 'zone_id'`.

- [ ] **Step 3: Implement (edit `fire_danger/pipeline.py`)**

Change the single-zone signature and its classify call:

```python
def compute_zone_forecast(forecast: list[DayWeather],
                          start_state: tuple[float, float, float],
                          hemisphere: str,
                          zone_id: str | None = None) -> tuple[list[dict], tuple[float, float, float]]:
```
and in its loop replace `danger_class(out["fwi"])` with `danger_class(out["fwi"], zone_id)`.

Change the grid signature and the aggregated classify call:

```python
def compute_zone_forecast_grid(
    per_point_forecasts: list[list[DayWeather]],
    per_point_state: list[tuple[float, float, float]],
    hemisphere: str,
    zone_id: str | None = None,
) -> tuple[list[dict], list[tuple[float, float, float]]]:
```
Inside, the per-point `compute_zone_forecast(forecast, start_state, hemisphere)` calls stay WITHOUT `zone_id` (their per-point classes are discarded). Only the aggregated row classifies with the zone:
replace `"danger_class": danger_class(agg),` with `"danger_class": danger_class(agg, zone_id),`.

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/python -m pytest tests/python/test_pipeline.py -v`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/pipeline.py tests/python/test_pipeline.py
git commit -m "feat: thread zone_id through the pipeline to calibrated classify

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Daily sync passes `zone.id`

**Files:**
- Modify: `api/fire-danger-sync.py`

- [ ] **Step 1: Update the grid call in `_sync_zone`**

In `api/fire-danger-sync.py`, change:

```python
    results, carry_states = compute_zone_forecast_grid(forecasts, states, zone.hemisphere)
```
to:

```python
    results, carry_states = compute_zone_forecast_grid(forecasts, states, zone.hemisphere, zone.id)
```

- [ ] **Step 2: Verify it parses and the suite is green**

Run: `.venv/bin/python -c "import ast; ast.parse(open('api/fire-danger-sync.py').read()); print('ok')"`
Expected: `ok`
Run: `.venv/bin/python -m pytest tests/python -q`
Expected: PASS (whole suite).

- [ ] **Step 3: Commit**

```bash
git add api/fire-danger-sync.py
git commit -m "feat: daily sync classifies with the zone's calibrated cuts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Generate the 10-year series + bake the JSON (GATED on quota)

Run incrementally via the resumable cache; produces the real `danger_thresholds.json`. The code (Tasks 1–4) already works with the global fallback until this JSON exists.

**Files:**
- Modify: `scripts/fwi-validation/compute_ours_grid.py` (widen YEARS)
- Create (generated): `fire_danger/danger_thresholds.json`

- [ ] **Step 1: Widen the window** — in `scripts/fwi-validation/compute_ours_grid.py` change:

```python
YEARS = list(range(2019, 2023))  # recent 4 years; CEMS ref covers through 2022
```
to:

```python
YEARS = list(range(2013, 2023))  # 10 years for stable tail percentiles (calibration)
```

- [ ] **Step 2: Build the series (incremental; resumes through 429s)**

Run from `scripts/fwi-validation`: `venv/bin/python compute_ours_grid.py`
Expected: prints per-year progress (`(cached)` for already-fetched years, fresh fetches for 2013–2018), retrying on 429. Re-run until it prints `wrote ours_tdf.csv: <~7300+> rows` (10yr × 2 zones). The cache (`om_cache/`) preserves progress across runs, so each run only fetches missing `(zone, year)` blocks.

- [ ] **Step 3: Calibrate**

Run from `scripts/fwi-validation`: `venv/bin/python calibrate.py`
Expected: writes `fire_danger/danger_thresholds.json` and prints per-zone `n=<~3650> days` and the four cuts. Sanity: `tdf-norte-estepa` (steppe) cuts should be HIGHER in absolute FWI than `tdf-sur-bosque` (forest).

- [ ] **Step 4: Sanity-check the resulting distribution**

Run from `scripts/fwi-validation`:
```bash
venv/bin/python -c "
import json, pandas as pd, pathlib, sys
sys.path.insert(0, str(pathlib.Path('.').resolve().parents[1]))
from fire_danger.classify import danger_class
th = json.load(open('../../fire_danger/danger_thresholds.json'))
df = pd.read_csv('ours_tdf.csv')
ZONE={'rio_grande':'tdf-norte-estepa','ushuaia':'tdf-sur-bosque'}
for p,g in df.groupby('point'):
    z=ZONE[p]; cls=g['fwi_ours'].map(lambda v: danger_class(v, z))
    print(z, dict(cls.value_counts(normalize=True).round(2)))
"
```
Expected: roughly `bajo ≈ 0.30`, `moderado ≈ 0.40`, `alto ≈ 0.20`, `muy alto ≈ 0.07`, `extremo ≈ 0.03` per zone (by construction of the percentiles). If wildly off, stop and investigate before committing.

- [ ] **Step 5: Commit the baked JSON (NOT ours_tdf.csv — gitignored)**

```bash
git add fire_danger/danger_thresholds.json scripts/fwi-validation/compute_ours_grid.py
git commit -m "feat: bake per-zone calibrated FWI thresholds (10yr, TDF)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification
- [ ] `.venv/bin/python -m pytest tests/python -q` green (classify + pipeline).
- [ ] `scripts/fwi-validation/venv/bin/python -m pytest scripts/fwi-validation/test_calibrate.py -q` green.
- [ ] `danger_thresholds.json` present, monotonic per zone, steppe cuts > forest cuts.
- [ ] Class distribution per zone ≈ 30/40/20/7/3.
- [ ] Frontend untouched (consumes `danger_class` already computed in `fire_danger`).

## Notes / deferred
- **Absolute floor** (extremo = p97 AND fwi ≥ X) deferred to a later iteration; the JSON shape supports adding it without a redesign.
- **Making `/provincia` public** is the next sub-project (citizen language), not this one.
- Production picks up the calibrated classes automatically on the next `fire-danger-sync` once the JSON is deployed (no migration; the JSON ships in the bundle).
