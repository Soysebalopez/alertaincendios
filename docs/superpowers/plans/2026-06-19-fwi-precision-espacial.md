# FWI Spatial Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute each fire-danger zone's FWI over a land grid of points and aggregate to one value by p95, shared identically between the historical calibration input and the daily production pipeline.

**Architecture:** A static per-zone land grid (0.2°, baked offline with Natural Earth 50m) drives a per-point chained FWI; each day's N point-FWIs aggregate by p95. The aggregation is one pure function (`fire_danger/aggregate.py`) used by both the offline historical computation and the production cron. Per-point state persists as an additive `grid_state jsonb` column; production never imports a geospatial library.

**Tech Stack:** Python 3.x (stdlib + `requests`), pytest. Offline grid builder uses `shapely` + `pyshp` (validation venv only). Supabase Postgres (PostgREST). Open-Meteo multi-point API.

**Conventions:**
- Run unit tests: `.venv/bin/python -m pytest tests/python -v` (pytest config: `pythonpath=.`, `testpaths=tests/python`).
- Tests live in `tests/python/`, mirror the `fire_danger/` module name, use fixtures + `monkeypatch` (see `tests/python/test_openmeteo.py`).
- Commit messages: conventional prefix, English. End with the `Co-Authored-By` trailer.
- Production migrations are GATED: write the SQL file, present it, wait for explicit OK before applying to `qmzuwnilehldvobjsbcs`.

---

### Task 1: Aggregation primitive (`aggregate.py`)

The pure p95 function — the shared core. No dependencies, no I/O.

**Files:**
- Create: `fire_danger/aggregate.py`
- Test: `tests/python/test_aggregate.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/python/test_aggregate.py
from fire_danger.aggregate import percentile, aggregate_fwi, leader_index


def test_percentile_linear_interpolation_matches_numpy_default():
    # numpy.percentile(range(11), 95) == 9.5  (rank = 0.95 * 10 = 9.5)
    assert percentile([float(i) for i in range(11)], 95.0) == 9.5


def test_percentile_two_points():
    assert percentile([0.0, 10.0], 95.0) == 9.5


def test_percentile_uniform_list():
    assert percentile([5.0, 5.0, 5.0], 95.0) == 5.0


def test_aggregate_fwi_single_point_equals_value():
    assert aggregate_fwi([12.34]) == 12.34


def test_aggregate_fwi_robust_to_single_outlier():
    # 49 calm points + 1 spike: p95 stays in the calm bulk, not at the spike
    assert aggregate_fwi([3.0] * 49 + [80.0]) < 20.0


def test_leader_index_picks_point_closest_to_p95():
    # p95 of [0..10] is 9.5; values 9 and 10 are equidistant; min() picks the
    # first occurrence -> index 9 (value 9.0)
    assert leader_index([float(i) for i in range(11)]) == 9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/python/test_aggregate.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fire_danger.aggregate'`

- [ ] **Step 3: Write minimal implementation**

```python
# fire_danger/aggregate.py
"""Aggregate a zone's per-point FWI values into one number. The zone's danger =
p95 of its points: nearly as sensitive as the max to the worst sector, but
robust to a single border (coast/mountain) artifact pixel. Pure stdlib; shared
by the historical calibration input and the production pipeline so both measure
the same thing."""
from __future__ import annotations


def percentile(values: list[float], q: float) -> float:
    """Linear-interpolation percentile (numpy's default method). q in [0, 100].
    Requires a non-empty list."""
    if not values:
        raise ValueError("percentile of empty list")
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    rank = (q / 100.0) * (len(s) - 1)
    lo = int(rank)
    if lo + 1 >= len(s):
        return s[-1]
    frac = rank - lo
    return s[lo] + frac * (s[lo + 1] - s[lo])


def aggregate_fwi(values: list[float]) -> float:
    """The zone's FWI = p95 of its per-point values."""
    return percentile(values, 95.0)


def leader_index(values: list[float]) -> int:
    """Index of the point whose FWI is closest to the p95 — used to pick a
    consistent set of components (temp/rh/wind/...) that belong to a real point
    rather than mixing independent per-component percentiles."""
    target = aggregate_fwi(values)
    return min(range(len(values)), key=lambda i: abs(values[i] - target))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/python/test_aggregate.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add fire_danger/aggregate.py tests/python/test_aggregate.py
git commit -m "feat: p95 zone aggregation primitive for FWI grid

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Open-Meteo multi-point fetch (`openmeteo.py`)

One request returns N point series (Open-Meteo accepts comma-separated coords and replies with a JSON list).

**Files:**
- Modify: `fire_danger/openmeteo.py` (append functions; keep single-point ones)
- Test: `tests/python/test_openmeteo.py` (append)

- [ ] **Step 1: Write the failing test (append to `tests/python/test_openmeteo.py`)**

```python
def test_fetch_forecast_multi_returns_one_series_per_point(monkeypatch):
    import fire_danger.openmeteo as om
    raw = json.loads(FIX.read_text())

    class _Resp:
        def raise_for_status(self): pass
        def json(self): return [raw, raw]  # Open-Meteo returns a list for many points

    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["params"] = params
        return _Resp()

    monkeypatch.setattr(om.requests, "get", fake_get)

    series = om.fetch_forecast_multi([(-53.7, -67.7), (-54.8, -68.3)], days=3)
    assert len(series) == 2
    assert all(len(s) >= 1 for s in series)
    assert isinstance(series[0][0], DayWeather)
    # coords are encoded as comma-separated lists, in order
    assert captured["params"]["latitude"] == "-53.7,-54.8"
    assert captured["params"]["longitude"] == "-67.7,-68.3"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/python/test_openmeteo.py::test_fetch_forecast_multi_returns_one_series_per_point -v`
Expected: FAIL — `AttributeError: module 'fire_danger.openmeteo' has no attribute 'fetch_forecast_multi'`

- [ ] **Step 3: Write minimal implementation (append to `fire_danger/openmeteo.py`)**

```python
def _get_multi(url: str, params: dict) -> list[dict]:
    resp = requests.get(url, params=params, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    # Open-Meteo returns a bare object for one location, a list for many.
    return data if isinstance(data, list) else [data]


def _points_params(points: list[tuple[float, float]]) -> dict:
    return {
        "latitude": ",".join(str(p[0]) for p in points),
        "longitude": ",".join(str(p[1]) for p in points),
        "hourly": _HOURLY, "wind_speed_unit": "kmh", "timezone": TZ,
    }


def fetch_forecast_multi(points: list[tuple[float, float]], days: int = 16) -> list[list[DayWeather]]:
    blocks = _get_multi(FORECAST_URL, {**_points_params(points), "forecast_days": days})
    return [parse_daily(b) for b in blocks]


def fetch_history_multi(points: list[tuple[float, float]],
                        start_date: str, end_date: str) -> list[list[DayWeather]]:
    blocks = _get_multi(ARCHIVE_URL, {**_points_params(points),
                                      "start_date": start_date, "end_date": end_date})
    return [parse_daily(b) for b in blocks]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/python/test_openmeteo.py -v`
Expected: PASS (both the existing and the new test)

- [ ] **Step 5: Commit**

```bash
git add fire_danger/openmeteo.py tests/python/test_openmeteo.py
git commit -m "feat: Open-Meteo multi-point fetch (one request, N series)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Offline grid builder + baked grids (`build_grids.py`)

Generate the per-zone land grids ONCE, offline, and commit the JSON. Uses `shapely`+`pyshp` in the validation venv only.

**Files:**
- Modify: `scripts/fwi-validation/requirements.txt` (add deps)
- Create: `scripts/fwi-validation/build_grids.py`
- Create (generated): `fire_danger/grids/tdf-norte-estepa.json`, `fire_danger/grids/tdf-sur-bosque.json`
- Modify: `scripts/fwi-validation/.gitignore` (ignore the downloaded shapefiles)

- [ ] **Step 1: Add deps to `scripts/fwi-validation/requirements.txt`**

Append these two lines:

```
pyshp>=2.3.0
shapely>=2.0.0
```

Install into the validation venv:

Run: `scripts/fwi-validation/venv/bin/pip install pyshp shapely`
Expected: both install successfully.

- [ ] **Step 2: Ignore the downloaded shapefiles (append to `scripts/fwi-validation/.gitignore`)**

```
ne_land/
ne_lakes/
ne_50m_land.zip
ne_50m_lakes.zip
```

- [ ] **Step 3: Download Natural Earth 50m physical (land + lakes)**

```bash
cd scripts/fwi-validation
curl -L -o ne_50m_land.zip  https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip
curl -L -o ne_50m_lakes.zip https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_lakes.zip
unzip -o ne_50m_land.zip  -d ne_land
unzip -o ne_50m_lakes.zip -d ne_lakes
cd ../..
```
Expected: `scripts/fwi-validation/ne_land/ne_50m_land.shp` and `ne_lakes/ne_50m_lakes.shp` exist.

- [ ] **Step 4: Write the grid builder**

```python
# scripts/fwi-validation/build_grids.py
"""Build the per-zone land grid for FWI spatial precision. OFFLINE, run once.

Generates a 0.2-degree grid inside each zone bbox, drops points over water using
Natural Earth 50m (land minus lakes), and writes fire_danger/grids/<zone>.json
(list of [lat, lng], 4 decimals). Deps live in this validation venv only —
production never imports shapely/shapefile.

Prereqs (see plan Task 3): ne_land/ne_50m_land.shp, ne_lakes/ne_50m_lakes.shp.
"""
import json
import pathlib
import sys

import numpy as np
import shapefile  # pyshp
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.zones import ZONES  # noqa: E402

STEP = 0.2
HERE = pathlib.Path(__file__).resolve().parent
OUT_DIR = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "grids"


def _load(shp_path: pathlib.Path):
    sr = shapefile.Reader(str(shp_path))
    return unary_union([shape(s.__geo_interface__) for s in sr.shapes()])


def build() -> None:
    land = prep(_load(HERE / "ne_land" / "ne_50m_land.shp"))
    lakes = prep(_load(HERE / "ne_lakes" / "ne_50m_lakes.shp"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for z in ZONES:
        s, n, w, e = z.bbox
        pts = []
        for lat in np.arange(s, n + 1e-9, STEP):
            for lng in np.arange(w, e + 1e-9, STEP):
                p = Point(float(lng), float(lat))  # shapely is (x=lng, y=lat)
                if land.contains(p) and not lakes.contains(p):
                    pts.append([round(float(lat), 4), round(float(lng), 4)])
        (OUT_DIR / f"{z.id}.json").write_text(json.dumps(pts))
        print(f"{z.id}: {len(pts)} land points")


if __name__ == "__main__":
    build()
```

- [ ] **Step 5: Run the builder and sanity-check the output**

Run: `scripts/fwi-validation/venv/bin/python scripts/fwi-validation/build_grids.py`
Expected: prints two lines, each with ~35–55 land points (e.g. `tdf-norte-estepa: 48 land points`). If a zone shows 0 or > 200, stop and check the shapefile paths / bbox orientation.

Verify the JSON exists and is a non-empty list of `[lat, lng]` pairs:

Run: `.venv/bin/python -c "import json; d=json.load(open('fire_danger/grids/tdf-norte-estepa.json')); print(len(d), d[0])"`
Expected: a count and a `[lat, lng]` pair inside the zone bbox.

- [ ] **Step 6: Commit (script + generated grids, NOT the downloaded shapefiles)**

```bash
git add scripts/fwi-validation/build_grids.py scripts/fwi-validation/requirements.txt \
        scripts/fwi-validation/.gitignore fire_danger/grids/
git commit -m "feat: offline grid builder + baked per-zone land grids (NE 50m)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Grid loader (`grids.py`)

Client-safe loader for the baked JSON. No geospatial deps.

**Files:**
- Create: `fire_danger/grids.py`
- Test: `tests/python/test_grids.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/python/test_grids.py
from fire_danger.grids import grid_points
from fire_danger.zones import ZONES


def test_grid_points_loads_each_zone_inside_its_bbox():
    for zone in ZONES:
        pts = grid_points(zone.id)
        assert len(pts) > 10, f"{zone.id} grid too small"
        s, n, w, e = zone.bbox
        for lat, lng in pts:
            assert s <= lat <= n and w <= lng <= e


def test_grid_points_missing_zone_returns_empty_tuple():
    assert grid_points("does-not-exist") == ()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/python/test_grids.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fire_danger.grids'`

- [ ] **Step 3: Write minimal implementation**

```python
# fire_danger/grids.py
"""Load a zone's pre-baked land grid. Client-safe: no geospatial deps — the grid
was computed offline by scripts/fwi-validation/build_grids.py and committed as
JSON. Callers fall back to the zone's representative point when the grid is empty
(see api/fire-danger-sync.py)."""
from __future__ import annotations

import functools
import json
import pathlib

_GRID_DIR = pathlib.Path(__file__).resolve().parent / "grids"


@functools.lru_cache(maxsize=None)
def grid_points(zone_id: str) -> tuple[tuple[float, float], ...]:
    """Return the zone's land-grid points as ((lat, lng), ...), or () if no grid
    file exists for the zone."""
    path = _GRID_DIR / f"{zone_id}.json"
    if not path.exists():
        return ()
    raw = json.loads(path.read_text())
    return tuple((float(lat), float(lng)) for lat, lng in raw)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/python/test_grids.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add fire_danger/grids.py tests/python/test_grids.py
git commit -m "feat: client-safe loader for baked per-zone grids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Gridded pipeline (`compute_zone_forecast_grid`)

Chain FWI per point (independent state), aggregate each day by p95, components from the leader point.

**Files:**
- Modify: `fire_danger/pipeline.py`
- Test: `tests/python/test_pipeline.py` (append)

- [ ] **Step 1: Write the failing tests (append to `tests/python/test_pipeline.py`)**

```python
from fire_danger.pipeline import compute_zone_forecast_grid  # add to imports
from fire_danger.aggregate import aggregate_fwi


def test_grid_of_one_point_matches_single_point():
    forecast = [_day("2026-06-18", 17.0, 42.0, 25.0), _day("2026-06-19", 20.0, 30.0, 30.0)]
    start = (85.0, 6.0, 15.0)
    single, single_carry = compute_zone_forecast(forecast, start, hemisphere="south")
    grid, grid_carries = compute_zone_forecast_grid([forecast], [start], hemisphere="south")
    assert grid == single
    assert grid_carries == [single_carry]


def test_grid_points_carry_independent_state():
    wet = [_day("2026-06-18", 10.0, 95.0, 5.0, precip=20.0)]
    dry = [_day("2026-06-18", 25.0, 15.0, 30.0, precip=0.0)]
    start = (85.0, 6.0, 15.0)
    _, carries = compute_zone_forecast_grid([wet, dry], [start, start], hemisphere="south")
    assert carries[0] != carries[1]  # different weather -> different per-point state


def test_grid_day_fwi_equals_p95_of_point_fwis():
    hot = [_day("2026-01-15", 30.0, 12.0, 35.0)]
    cool = [_day("2026-01-15", 14.0, 80.0, 8.0)]
    start = (85.0, 6.0, 15.0)
    res_hot, _ = compute_zone_forecast(hot, start, hemisphere="south")
    res_cool, _ = compute_zone_forecast(cool, start, hemisphere="south")
    res_grid, _ = compute_zone_forecast_grid([hot, cool], [start, start], hemisphere="south")
    assert res_grid[0]["fwi"] == round(aggregate_fwi([res_hot[0]["fwi"], res_cool[0]["fwi"]]), 2)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/python/test_pipeline.py -k grid -v`
Expected: FAIL — `ImportError: cannot import name 'compute_zone_forecast_grid'`

- [ ] **Step 3: Write minimal implementation (append to `fire_danger/pipeline.py`)**

Add to the imports at the top:

```python
from fire_danger.aggregate import aggregate_fwi, leader_index
```

Append the function:

```python
def compute_zone_forecast_grid(
    per_point_forecasts: list[list[DayWeather]],
    per_point_state: list[tuple[float, float, float]],
    hemisphere: str,
) -> tuple[list[dict], list[tuple[float, float, float]]]:
    """Grid version of compute_zone_forecast. Chain the FWI per point — each point
    carries its OWN (ffmc,dmc,dc) forward, because the spatial heterogeneity lives
    in DC/DMC and sharing state would erase it — then aggregate each forecast day's
    N point-FWIs by p95. The row's components (isi/bui/temp/rh/wind/precip) come
    from the 'leader' point closest to that p95, so the row stays consistent with a
    real point. Returns (results, carry_states) — one carry_state per point, all to
    be persisted (each continues its own chain tomorrow)."""
    per_point_results: list[list[dict]] = []
    carry_states: list[tuple[float, float, float]] = []
    for forecast, start_state in zip(per_point_forecasts, per_point_state):
        results, carry = compute_zone_forecast(forecast, start_state, hemisphere)
        per_point_results.append(results)
        carry_states.append(carry)

    n_days = min(len(r) for r in per_point_results)
    aggregated: list[dict] = []
    for d in range(n_days):
        day_rows = [pr[d] for pr in per_point_results]
        fwis = [row["fwi"] for row in day_rows]
        agg = round(aggregate_fwi(fwis), 2)
        lead = day_rows[leader_index(fwis)]
        aggregated.append({
            "target_date": lead["target_date"],
            "fwi": agg,
            "isi": lead["isi"], "bui": lead["bui"],
            "danger_class": danger_class(agg),
            "temp": lead["temp"], "rh": lead["rh"],
            "wind": lead["wind"], "precip": lead["precip"],
        })
    return aggregated, carry_states
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/python/test_pipeline.py -v`
Expected: PASS (existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add fire_danger/pipeline.py tests/python/test_pipeline.py
git commit -m "feat: gridded zone forecast (per-point state + p95 aggregation)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Persist per-point state (`supabase_io` grid_state)

Shape and read the per-point grid state as a JSON array on one row per zone/day.

**Files:**
- Modify: `fire_danger/supabase_io.py`
- Test: `tests/python/test_supabase_io.py` (append)

- [ ] **Step 1: Write the failing test (append to `tests/python/test_supabase_io.py`)**

```python
from fire_danger.supabase_io import grid_state_row  # add to imports


def test_grid_state_row_shape():
    row = grid_state_row("tdf-norte-estepa", "2026-06-18",
                         [(87.7, 8.5, 19.0), (90.1, 12.0, 25.0)])
    assert row["zone_id"] == "tdf-norte-estepa"
    assert row["date"] == "2026-06-18"
    assert row["grid_state"] == [
        {"ffmc": 87.7, "dmc": 8.5, "dc": 19.0},
        {"ffmc": 90.1, "dmc": 12.0, "dc": 25.0},
    ]
    # legacy NOT-NULL scalars fall back to the first grid point
    assert (row["ffmc"], row["dmc"], row["dc"]) == (87.7, 8.5, 19.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/python/test_supabase_io.py::test_grid_state_row_shape -v`
Expected: FAIL — `ImportError: cannot import name 'grid_state_row'`

- [ ] **Step 3: Write minimal implementation**

Add the pure shaper next to `state_row` in `fire_danger/supabase_io.py`:

```python
def grid_state_row(zone_id: str, date: str,
                   carry_states: list[tuple[float, float, float]]) -> dict:
    """One fire_danger_state row carrying the whole grid's per-point state as a
    JSON array (grid order). The legacy NOT-NULL scalar ffmc/dmc/dc mirror the
    first grid point for back-compat readers; grid_state is the source of truth."""
    first = carry_states[0]
    return {
        "zone_id": zone_id, "date": date,
        "ffmc": first[0], "dmc": first[1], "dc": first[2],
        "grid_state": [{"ffmc": s[0], "dmc": s[1], "dc": s[2]} for s in carry_states],
    }
```

Add the reader next to `latest_state` (network I/O, not unit-mocked — same convention as `latest_state`):

```python
def latest_grid_state(zone_id: str,
                      before_date: str | None = None) -> list[tuple[float, float, float]] | None:
    """Most-recent per-point grid state for a zone, or None if absent (legacy row
    or never seeded). `before_date` keeps a same-day re-run idempotent, exactly
    like latest_state."""
    url, key = _base()
    if not url or not key:
        return None
    params = {"zone_id": f"eq.{zone_id}", "select": "grid_state,date",
              "order": "date.desc", "limit": 1}
    if before_date:
        params["date"] = f"lt.{before_date}"
    resp = requests.get(
        f"{url}/rest/v1/fire_danger_state",
        params=params,
        headers=_headers(key, "return=representation"), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data or not data[0].get("grid_state"):
        return None
    return [(s["ffmc"], s["dmc"], s["dc"]) for s in data[0]["grid_state"]]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/python/test_supabase_io.py -v`
Expected: PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add fire_danger/supabase_io.py tests/python/test_supabase_io.py
git commit -m "feat: persist/read per-point grid_state in fire_danger_state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Additive migration (`grid_state jsonb`)

Write the SQL file. GATED — do NOT apply until the user OKs it.

**Files:**
- Create: `scripts/sql/whi-fwi-grid-state.sql`

- [ ] **Step 1: Write the migration**

```sql
-- scripts/sql/whi-fwi-grid-state.sql
-- FWI spatial precision — add per-point grid state to fire_danger_state.
-- ADDITIVE: a single nullable jsonb column. Existing rows and readers are
-- unaffected; the legacy scalar ffmc/dmc/dc columns (NOT NULL) remain.
--
-- APPLY GATED: present this file and wait for explicit OK before running it
-- against the shared production project (qmzuwnilehldvobjsbcs).

alter table public.fire_danger_state
  add column if not exists grid_state jsonb;

comment on column public.fire_danger_state.grid_state is
  'Per-point FWI state for the zone grid: array of {ffmc,dmc,dc} in grid order. '
  'Null = legacy single-point row.';
```

- [ ] **Step 2: Verify it parses (no apply)**

Run: `grep -c "add column if not exists grid_state" scripts/sql/whi-fwi-grid-state.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/whi-fwi-grid-state.sql
git commit -m "chore: additive migration for fire_danger_state.grid_state (gated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Present to user for apply approval**

Show the SQL, state it is additive and gated, and wait for explicit OK before applying via the Supabase MCP (`apply_migration`). Do NOT apply in this task.

---

### Task 8: Wire the grid into the daily pipeline (`fire-danger-sync.py`)

Switch `_sync_zone` from one point to the zone grid. Integration change — verified by the full suite + a post-deploy smoke (network I/O is not unit-mocked, per repo convention).

**Files:**
- Modify: `api/fire-danger-sync.py`

- [ ] **Step 1: Update imports**

In `api/fire-danger-sync.py`, change:

```python
from fire_danger import openmeteo, supabase_io, spinup
from fire_danger.pipeline import compute_zone_forecast
from fire_danger.zones import ZONES
```

to:

```python
from fire_danger import grids, openmeteo, supabase_io, spinup
from fire_danger.pipeline import compute_zone_forecast_grid
from fire_danger.zones import ZONES
```

- [ ] **Step 2: Replace `_sync_zone` body**

Replace the whole `_sync_zone` function with:

```python
def _sync_zone(zone, today: str) -> dict:
    """Compute and persist one zone over its land grid. Each grid point carries
    its own FWI state; the zone value is the p95 across points. Raises on failure
    so the caller isolates it per zone."""
    points = grids.grid_points(zone.id) or ((zone.lat, zone.lng),)

    states = supabase_io.latest_grid_state(zone.id, before_date=today)
    seeded = False
    # Re-seed when there is no grid state yet OR the grid changed shape (e.g. the
    # density was regenerated) — never chain misaligned per-point states.
    if states is None or len(states) != len(points):
        end = datetime.now(timezone.utc).date() - timedelta(days=1)
        start = end - timedelta(days=SPINUP_DAYS)
        histories = openmeteo.fetch_history_multi(list(points), start.isoformat(), end.isoformat())
        states = [tuple(spinup.replay_state(h, zone.hemisphere).values()) for h in histories]
        seeded = True

    forecasts = openmeteo.fetch_forecast_multi(list(points), days=16)
    results, carry_states = compute_zone_forecast_grid(forecasts, states, zone.hemisphere)

    supabase_io.insert_forecast(supabase_io.forecast_rows(zone.id, today, results))
    supabase_io.upsert_state([supabase_io.grid_state_row(zone.id, today, carry_states)])
    return {
        "zone": zone.id, "seeded": seeded, "points": len(points), "days": len(results),
        "today_class": results[0]["danger_class"] if results else None,
    }
```

- [ ] **Step 3: Verify the module parses and the suite is green**

Run: `.venv/bin/python -c "import ast; ast.parse(open('api/fire-danger-sync.py').read()); print('ok')"`
Expected: `ok`

Run: `.venv/bin/python -m pytest tests/python -v`
Expected: PASS (whole suite)

- [ ] **Step 4: Commit**

```bash
git add api/fire-danger-sync.py
git commit -m "feat: daily fire-danger sync runs over the zone grid (p95)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Post-deploy smoke (after the migration is applied — manual, gated)**

Once Task 7's migration is applied and the branch is deployed, hit the endpoint and confirm the response reports `points > 1` per zone and a `today_class`:

```bash
curl -s "https://<deploy>/api/fire-danger-sync?secret=$CRON_SECRET" | python -m json.tool
```
Expected: `ok: true`, each zone shows `"points": ~40-55`, `"seeded": true` on the first run.

---

### Task 9: Re-validate the gridded series vs CEMS

Close the loop: recompute OUR FWI over the grid (p95) for Río Grande and Ushuaia, re-run the CEMS comparison, confirm Spearman does not drop.

**Files:**
- Create: `scripts/fwi-validation/compute_ours_grid.py`
- Reuse: `scripts/fwi-validation/compare.py`, `metrics.py` (unchanged)

- [ ] **Step 1: Write the gridded historical computation**

```python
# scripts/fwi-validation/compute_ours_grid.py
"""Compute OUR FWI over 2014-2023 for the two TDF zones OVER THE GRID (p95) and
write ours_tdf.csv. Mirrors compute_ours.py but, instead of one representative
point, computes the FWI at every grid point of the zone, chains each point's
state independently, and aggregates each day by p95 — exactly what production
does. Run once, then re-run compare.py."""
import sys
import pathlib
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger import fwi as fwi_eq          # noqa: E402
from fire_danger import openmeteo, grids       # noqa: E402
from fire_danger.aggregate import aggregate_fwi  # noqa: E402

# validation point name -> production zone id
ZONE_OF = {"rio_grande": "tdf-norte-estepa", "ushuaia": "tdf-sur-bosque"}
YEARS = list(range(2014, 2024))
SPINUP_DROP = 30


def _series_for_point(days):
    state = fwi_eq.DEFAULT_STATE
    out = []
    for d in days:
        r = fwi_eq.fwi_from_weather(temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
                                    month=d.month, hemisphere="south", prev=state)
        s = r["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        out.append((d.date, r["fwi"]))
    return out[SPINUP_DROP:]


def compute_zone(zone_id):
    points = list(grids.grid_points(zone_id))
    # fetch history per point, year by year (archive responses get large)
    per_point_days = [[] for _ in points]
    for year in YEARS:
        blocks = openmeteo.fetch_history_multi(points, f"{year}-01-01", f"{year}-12-31")
        for i, days in enumerate(blocks):
            per_point_days[i].extend(days)

    per_point_series = [dict(_series_for_point(days)) for days in per_point_days]
    dates = sorted(per_point_series[0])
    rows = []
    for date in dates:
        fwis = [s[date] for s in per_point_series if date in s]
        rows.append({"date": date, "fwi_ours": round(aggregate_fwi(fwis), 3)})
    return rows


if __name__ == "__main__":
    all_rows = []
    for name, zid in ZONE_OF.items():
        print(f"Computing {name} over grid ({len(grids.grid_points(zid))} points)...")
        for r in compute_zone(zid):
            all_rows.append({"point": name, **r})
    pd.DataFrame(all_rows).to_csv("ours_tdf.csv", index=False)
    print(f"wrote ours_tdf.csv: {len(all_rows)} rows")
```

- [ ] **Step 2: Run the gridded computation**

Run: `cd scripts/fwi-validation && venv/bin/python compute_ours_grid.py && cd ../..`
Expected: prints the point counts and `wrote ours_tdf.csv: ~6500+ rows`.

- [ ] **Step 3: Re-run the comparison vs CEMS**

Run: `cd scripts/fwi-validation && venv/bin/python compare.py && cd ../..`
Expected: rewrites `REPORT.md`; prints `worst Spearman = <value>`.

- [ ] **Step 4: Check the success criterion**

Open `scripts/fwi-validation/REPORT.md`. **Success = the gridded Spearman does NOT drop** vs the 1-point baseline (Río Grande 0.909, Ushuaia 0.796; ideally Ushuaia improves). If it drops materially, stop and investigate before proceeding to calibration — do not silently accept a regression.

- [ ] **Step 5: Commit the validation script + report**

```bash
git add scripts/fwi-validation/compute_ours_grid.py scripts/fwi-validation/REPORT.md \
        scripts/fwi-validation/scatter_rio_grande.png scripts/fwi-validation/scatter_ushuaia.png
git commit -m "feat: re-validate gridded FWI (p95) vs CEMS over TDF

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] Run the whole unit suite: `.venv/bin/python -m pytest tests/python -v` → all green.
- [ ] `fire_danger/grids/*.json` committed; downloaded shapefiles NOT committed (`git status` clean of `ne_land/`, `ne_lakes/`).
- [ ] `scripts/sql/whi-fwi-grid-state.sql` present and **not yet applied** (awaiting user OK).
- [ ] `scripts/fwi-validation/REPORT.md` shows gridded Spearman ≥ the 1-point baseline.
- [ ] Production smoke (Task 8 Step 5) deferred until the migration is applied and the branch deployed.

## Notes on what's intentionally deferred (next sub-projects)
- **Threshold calibration by local percentiles** — consumes the gridded historical series this plan produces; not in scope here.
- **Citizen-readable language** and **making the province page public** — later sub-projects.
- The page UI, the zone representative `lat/lng`, and zones outside TDF are untouched.
