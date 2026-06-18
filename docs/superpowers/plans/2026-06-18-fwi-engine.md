# FWI Engine (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute the daily Canadian Fire Weather Index (FWI) per Tierra del Fuego zone from Open-Meteo, carry forward the moisture state day-to-day, seed it from history so zones are valid on day 1, and persist the forecast to Supabase — with **no UI** (that is Milestone 2).

**Architecture:** A pure, fully-tested Python package `fire_danger/` at the repo root (the FWI equations, danger classification, zones, Open-Meteo client, Supabase I/O) imported by a thin Vercel Function `api/fire-danger-sync.py` (same `BaseHTTPRequestHandler` + `run_pipeline()` pattern as `api/goes-sync.py`). The function is triggered daily by pg_cron, reads yesterday's `fire_danger_state` per zone, fetches weather, chains the FWI calculation forward, classifies, and upserts both the rolling state and the forecast rows. Three new Supabase tables hold zones, the carried state, and the readable forecast.

**Tech Stack:** Python 3.12 (Vercel default) · stdlib `math` for the FWI equations (canonical, zero new runtime deps; `numpy` is already bundled via the GOES function if vectorization is ever wanted) · `requests` for Open-Meteo + PostgREST · `pytest` for tests (dev-only, not shipped) · Supabase PostgREST · Open-Meteo Forecast + Historical (Archive) APIs.

---

## Design decisions (closed before writing this plan)

These were resolved from the spec (`docs/superpowers/specs/2026-06-17-prevencion-fwi-design.md`), the codebase, and an explicit user choice. Do not re-litigate them during execution.

1. **Native FWI equations (user choice, 2026-06-18).** Implement the 6 Van Wagner & Pickett (1985) / CFFDRS equations ourselves in pure `math` — no `cffdrs`/`xclim` dependency. Reasons: zero bundle weight, the repo already inlines logic to keep Python bundles lean, and the FWI has **published canonical test vectors** → ideal TDD. `cffdrs` (R) is used **offline only**, as an independent oracle to generate the reference fixture (Task 1).
2. **Pure package at repo root, thin endpoint.** Vercel's Python runtime (docs verified 2026-06-18): no tree-shaking (everything reachable is bundled), only files defining a `handler`/`app` become Functions, and cwd at runtime is the project root. So `fire_danger/` at the root is importable both by `pytest` (locally) and by `api/fire-danger-sync.py` (at runtime), and a helper module never becomes a stray endpoint.
3. **Southern-hemisphere day-length tables.** The DMC and DC use month-indexed day-length factors tabulated for the **Northern** hemisphere. TDF is **Southern** → the month index is shifted by 6. This is the single biggest correctness gotcha and gets its own module + test (Task 2).
4. **Provisional danger-class thresholds.** v1 uses documented provisional FWI thresholds (constant, easy to tune). Real calibration against GWIS/CEMS and the official provincial semaphore is Milestone 4 (deferred in the spec). The thresholds live in one place so M4 can recalibrate without touching logic.
5. **Migrations & cron are gated.** Per the global safety protocol, SQL goes into versioned files under `scripts/sql/` (the repo's established pattern — there is no `supabase/migrations/` dir). The plan **writes** the SQL and shows it; **applying** it (via the Supabase MCP `apply_migration`/`execute_sql`) and scheduling the pg_cron job happen only after explicit user OK. Do not push the branch or open a PR without being asked.
6. **Two zones for v1.** TDF North/steppe (represented by Río Grande `-53.7878,-67.7091`) and TDF South/forest (Ushuaia `-54.8019,-68.3029`, also covering Tolhuin `-54.5136,-67.1942`). The FWI is computed at the representative point; polygons for *painting* are a Milestone-2 concern, so `danger_zones.geometry` stays nullable for now.

## File Structure

| File | Responsibility |
|---|---|
| `fire_danger/__init__.py` | Package marker (empty). |
| `fire_danger/daylength.py` | NH day-length tables (Le for DMC, Lf for DC) + hemisphere-aware lookup (the SH shift). |
| `fire_danger/fwi.py` | The 6 equations (`ffmc`, `dmc`, `dc`, `isi`, `bui`, `fwi`) + `fwi_from_weather()` that chains them and returns the new state. Pure floats in / out. |
| `fire_danger/classify.py` | `danger_class(fwi) -> str` using provisional thresholds. |
| `fire_danger/zones.py` | `ZONES`: the TDF zone definitions (id, name, lat, lng, bbox). |
| `fire_danger/openmeteo.py` | `fetch_forecast()` + `fetch_history()` → list of daily `DayWeather`. Pure HTTP, no Supabase. |
| `fire_danger/supabase_io.py` | PostgREST helpers: read latest state, upsert state, insert forecast rows, seed zones. Mirrors `goes-sync.py`'s direct-`requests` style. |
| `api/fire-danger-sync.py` | The Vercel Function: `handler` (auth, same as goes-sync) + `run_pipeline()` orchestration. |
| `tests/python/conftest.py` | Loads the reference fixture; shared helpers. |
| `tests/python/test_*.py` | One test module per `fire_danger` module. |
| `tests/python/fixtures/cffdrs_reference.json` | The offline-generated oracle (Task 1). |
| `tests/python/fixtures/openmeteo_forecast.json` | Captured Open-Meteo response for client tests. |
| `pytest.ini` | `pythonpath = .`, `testpaths = tests/python` (Vercel ignores it). |
| `scripts/sql/whi-fwi-schema.sql` | The 3 tables (gated apply). |
| `scripts/sql/whi-fwi-cron.sql` | The daily pg_cron job (gated apply). |
| `vercel.json` | Add the new function entry + tidy `excludeFiles`. |

---

## Task 1: Test harness + reference oracle fixture

**Files:**
- Create: `fire_danger/__init__.py` (empty)
- Create: `pytest.ini`
- Create: `tests/python/conftest.py`
- Create: `tests/python/fixtures/cffdrs_reference.json`
- Create: `requirements-dev.txt`

- [ ] **Step 1: Create the package marker and pytest config**

`fire_danger/__init__.py`: empty file.

`pytest.ini` (Vercel does not read `pytest.ini`, so this never affects the deploy/deps detection — unlike `pyproject.toml`, which Vercel would inspect for dependencies):

```ini
[pytest]
pythonpath = .
testpaths = tests/python
```

`requirements-dev.txt` (local only — **never** referenced by `vercel.json`, so it is not installed into any function bundle):

```
pytest>=8.0
requests>=2.31.0
```

- [ ] **Step 2: Create the reference fixture (the oracle)**

This is the independent source of truth for the equation tests. The values below are the canonical CFFDRS worked example (Van Wagner & Pickett 1985; reproduced in Wang, Anderson & Suddaby 2015, NRCan). Starting state is the CFFDRS default (`ffmc=85, dmc=6, dc=15`); a single April (month 4) Northern-hemisphere day with `temp=17, rh=42, wind=25, rain=0`:

`tests/python/fixtures/cffdrs_reference.json`:

```json
{
  "source": "CFFDRS worked example (Van Wagner & Pickett 1985 / Wang et al. 2015). Confirm with the R `cffdrs` package offline before trusting; the R package is the oracle.",
  "rounding": "Assertions compare to 1 decimal place to absorb implementation rounding differences.",
  "single_day": {
    "input": { "temp": 17.0, "rh": 42.0, "wind": 25.0, "rain": 0.0, "month": 4, "hemisphere": "north" },
    "prev":  { "ffmc": 85.0, "dmc": 6.0, "dc": 15.0 },
    "expect": { "ffmc": 87.7, "dmc": 8.5, "dc": 19.0, "isi": 10.9, "bui": 8.5, "fwi": 10.1 }
  }
}
```

> Execution note: if any equation test fails by more than the 1-decimal tolerance, **do not "fix" the expected value to match your output.** Regenerate the truth with the R `cffdrs` package (`cffdrs::fwi(...)`) offline, update this fixture from that oracle, and only then reconcile the implementation. A test passing because both the equation and the expectation are wrong in the same direction is the failure mode this fixture exists to prevent.

- [ ] **Step 3: Create conftest that exposes the fixture**

`tests/python/conftest.py`:

```python
import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def cffdrs_reference():
    with open(FIXTURES / "cffdrs_reference.json") as f:
        return json.load(f)
```

- [ ] **Step 4: Verify the harness runs (no tests yet → "no tests ran")**

Run: `python -m pytest -q`
Expected: exits 0 (or "no tests ran"), proving `pythonpath`/discovery work. If `pytest` is missing: `python -m pip install -r requirements-dev.txt`.

- [ ] **Step 5: Commit**

```bash
git add fire_danger/__init__.py pytest.ini requirements-dev.txt tests/python/conftest.py tests/python/fixtures/cffdrs_reference.json
git commit -m "test: scaffold fire_danger pytest harness + CFFDRS reference fixture"
```

---

## Task 2: Day-length tables (the Southern-hemisphere gotcha)

**Files:**
- Create: `fire_danger/daylength.py`
- Test: `tests/python/test_daylength.py`

- [ ] **Step 1: Write the failing test**

```python
from fire_danger.daylength import dmc_daylength, dc_daylength


def test_north_tables_match_van_wagner():
    # NH effective day length (DMC), months 1..12
    assert [dmc_daylength(m, "north") for m in range(1, 13)] == [
        6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0
    ]
    # NH day-length factor (DC), months 1..12
    assert [dc_daylength(m, "north") for m in range(1, 13)] == [
        -1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6
    ]


def test_south_is_north_shifted_six_months():
    # Southern summer (Jan) must use Northern summer (Jul) values, etc.
    for m in range(1, 13):
        nh_month = ((m + 6 - 1) % 12) + 1
        assert dmc_daylength(m, "south") == dmc_daylength(nh_month, "north")
        assert dc_daylength(m, "south") == dc_daylength(nh_month, "north")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_daylength.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.daylength'`.

- [ ] **Step 3: Write minimal implementation**

`fire_danger/daylength.py`:

```python
"""Month-indexed day-length factors for the DMC and DC, per Van Wagner & Pickett
(1985). The published tables are for the Northern hemisphere (~46N); for the
Southern hemisphere (Tierra del Fuego) the month index is shifted by 6 so that
the southern summer uses the northern summer's long-day values."""
from __future__ import annotations

# DMC: effective day length Le, months 1..12 (Northern hemisphere).
_DMC_NORTH = [6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0]
# DC: day-length factor Lf, months 1..12 (Northern hemisphere).
_DC_NORTH = [-1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6]


def _index(month: int, hemisphere: str) -> int:
    if not 1 <= month <= 12:
        raise ValueError(f"month out of range: {month}")
    if hemisphere == "south":
        return (month + 6 - 1) % 12
    if hemisphere == "north":
        return month - 1
    raise ValueError(f"hemisphere must be 'north' or 'south': {hemisphere!r}")


def dmc_daylength(month: int, hemisphere: str) -> float:
    return _DMC_NORTH[_index(month, hemisphere)]


def dc_daylength(month: int, hemisphere: str) -> float:
    return _DC_NORTH[_index(month, hemisphere)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/python/test_daylength.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/daylength.py tests/python/test_daylength.py
git commit -m "feat: FWI day-length tables with Southern-hemisphere shift"
```

---

## Task 3: FFMC (Fine Fuel Moisture Code)

**Files:**
- Create: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Write the failing test**

```python
from fire_danger import fwi


def test_ffmc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.ffmc(d["input"]["temp"], d["input"]["rh"], d["input"]["wind"],
                   d["input"]["rain"], d["prev"]["ffmc"])
    assert round(got, 1) == d["expect"]["ffmc"]  # 87.7


def test_ffmc_clamped_to_101():
    # bone-dry, hot, windy → saturates near the upper bound, never above 101
    assert fwi.ffmc(35.0, 5.0, 40.0, 0.0, 99.0) <= 101.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_ffmc_canonical -q`
Expected: FAIL with `AttributeError: module 'fire_danger.fwi' has no attribute 'ffmc'`.

- [ ] **Step 3: Write minimal implementation**

Create `fire_danger/fwi.py` with the module header and the FFMC equation:

```python
"""Canadian Forest Fire Weather Index (FWI) System — the six standard equations
of Van Wagner & Pickett (1985), as used by the Argentine SNMF/SMN. Pure floats,
stdlib math only. Wind in km/h, temp in C, rh in %, rain in mm (last 24h)."""
from __future__ import annotations

import math

from fire_danger.daylength import dc_daylength, dmc_daylength


def ffmc(temp: float, rh: float, wind: float, rain: float, ffmc_prev: float) -> float:
    rh = min(rh, 100.0)
    mo = 147.2 * (101.0 - ffmc_prev) / (59.5 + ffmc_prev)
    if rain > 0.5:
        rf = rain - 0.5
        if mo <= 150.0:
            mr = mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
        else:
            mr = (mo + 42.5 * rf * math.exp(-100.0 / (251.0 - mo)) * (1.0 - math.exp(-6.93 / rf))
                  + 0.0015 * (mo - 150.0) ** 2 * math.sqrt(rf))
        mo = min(mr, 250.0)
    ed = (0.942 * rh ** 0.679 + 11.0 * math.exp((rh - 100.0) / 10.0)
          + 0.18 * (21.1 - temp) * (1.0 - math.exp(-0.115 * rh)))
    if mo > ed:
        ko = 0.424 * (1.0 - (rh / 100.0) ** 1.7) + 0.0694 * math.sqrt(wind) * (1.0 - (rh / 100.0) ** 8)
        kd = ko * 0.581 * math.exp(0.0365 * temp)
        m = ed + (mo - ed) * 10.0 ** (-kd)
    else:
        ew = (0.618 * rh ** 0.753 + 10.0 * math.exp((rh - 100.0) / 10.0)
              + 0.18 * (21.1 - temp) * (1.0 - math.exp(-0.115 * rh)))
        if mo < ew:
            kl = (0.424 * (1.0 - ((100.0 - rh) / 100.0) ** 1.7)
                  + 0.0694 * math.sqrt(wind) * (1.0 - ((100.0 - rh) / 100.0) ** 8))
            kw = kl * 0.581 * math.exp(0.0365 * temp)
            m = ew - (ew - mo) * 10.0 ** (-kw)
        else:
            m = mo
    result = 59.5 * (250.0 - m) / (147.2 + m)
    return max(0.0, min(result, 101.0))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI FFMC equation"
```

---

## Task 4: DMC (Duff Moisture Code)

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_dmc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.dmc(d["input"]["temp"], d["input"]["rh"], d["input"]["rain"],
                  d["prev"]["dmc"], d["input"]["month"], d["input"]["hemisphere"])
    assert round(got, 1) == d["expect"]["dmc"]  # 8.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_dmc_canonical -q`
Expected: FAIL with `AttributeError: ... has no attribute 'dmc'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def dmc(temp: float, rh: float, rain: float, dmc_prev: float,
        month: int, hemisphere: str) -> float:
    rh = min(rh, 100.0)
    t = max(temp, -1.1)
    le = dmc_daylength(month, hemisphere)
    rk = 1.894 * (t + 1.1) * (100.0 - rh) * le * 1e-4
    if rain > 1.5:
        re = 0.92 * rain - 1.27
        mo = 20.0 + math.exp(5.6348 - dmc_prev / 43.43)
        if dmc_prev <= 33.0:
            b = 100.0 / (0.5 + 0.3 * dmc_prev)
        elif dmc_prev <= 65.0:
            b = 14.0 - 1.3 * math.log(dmc_prev)
        else:
            b = 6.2 * math.log(dmc_prev) - 17.2
        mr = mo + 1000.0 * re / (48.77 + b * re)
        pr = 244.72 - 43.43 * math.log(mr - 20.0)
        dmc_prev = max(pr, 0.0)
    return max(dmc_prev + rk, 0.0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI DMC equation (hemisphere-aware)"
```

---

## Task 5: DC (Drought Code)

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_dc_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.dc(d["input"]["temp"], d["input"]["rain"], d["prev"]["dc"],
                 d["input"]["month"], d["input"]["hemisphere"])
    assert round(got, 1) == d["expect"]["dc"]  # 19.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_dc_canonical -q`
Expected: FAIL with `AttributeError: ... has no attribute 'dc'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def dc(temp: float, rain: float, dc_prev: float, month: int, hemisphere: str) -> float:
    t = max(temp, -2.8)
    lf = dc_daylength(month, hemisphere)
    pe = max((0.36 * (t + 2.8) + lf) / 2.0, 0.0)
    if rain > 2.8:
        rd = 0.83 * rain - 1.27
        qo = 800.0 * math.exp(-dc_prev / 400.0)
        qr = qo + 3.937 * rd
        dr = 400.0 * math.log(800.0 / qr)
        dc_prev = max(dr, 0.0)
    return max(dc_prev + pe, 0.0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI DC equation (hemisphere-aware)"
```

---

## Task 6: ISI (Initial Spread Index)

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_isi_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    # ISI uses the *new* FFMC (the canonical example's resulting FFMC = 87.7)
    got = fwi.isi(d["input"]["wind"], d["expect"]["ffmc"])
    assert round(got, 1) == d["expect"]["isi"]  # 10.9
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_isi_canonical -q`
Expected: FAIL with `AttributeError: ... has no attribute 'isi'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def isi(wind: float, ffmc_val: float) -> float:
    fw = math.exp(0.05039 * wind)
    m = 147.2 * (101.0 - ffmc_val) / (59.5 + ffmc_val)
    ff = 91.9 * math.exp(-0.1386 * m) * (1.0 + m ** 5.31 / 4.93e7)
    return 0.208 * fw * ff
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI ISI equation"
```

---

## Task 7: BUI (Buildup Index)

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_bui_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.bui(d["expect"]["dmc"], d["expect"]["dc"])
    assert round(got, 1) == d["expect"]["bui"]  # 8.5


def test_bui_zero_when_dmc_zero():
    assert fwi.bui(0.0, 19.0) == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_bui_canonical -q`
Expected: FAIL with `AttributeError: ... has no attribute 'bui'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def bui(dmc_val: float, dc_val: float) -> float:
    if dmc_val == 0.0 and dc_val == 0.0:
        return 0.0
    if dmc_val <= 0.4 * dc_val:
        result = 0.8 * dmc_val * dc_val / (dmc_val + 0.4 * dc_val)
    else:
        result = dmc_val - (1.0 - 0.8 * dc_val / (dmc_val + 0.4 * dc_val)) * (
            0.92 + (0.0114 * dmc_val) ** 1.7
        )
    return max(result, 0.0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI BUI equation"
```

---

## Task 8: FWI (final index)

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_fwi_canonical(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    got = fwi.fwi(d["expect"]["isi"], d["expect"]["bui"])
    assert round(got, 1) == d["expect"]["fwi"]  # 10.1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_fwi_canonical -q`
Expected: FAIL with `AttributeError: ... has no attribute 'fwi'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def fwi(isi_val: float, bui_val: float) -> float:
    if bui_val <= 80.0:
        bb = 0.1 * isi_val * (0.626 * bui_val ** 0.809 + 2.0)
    else:
        bb = 0.1 * isi_val * (1000.0 / (25.0 + 108.64 * math.exp(-0.023 * bui_val)))
    if bb <= 1.0:
        return bb
    return math.exp(2.72 * (0.434 * math.log(bb)) ** 0.647)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: FWI final index equation"
```

---

## Task 9: `fwi_from_weather` — chain the equations and carry state

This is the function the pipeline calls per day: it takes yesterday's `(ffmc, dmc, dc)`, today's weather + month + hemisphere, and returns today's full result **including the new state to carry forward**.

**Files:**
- Modify: `fire_danger/fwi.py`
- Test: `tests/python/test_fwi.py`

- [ ] **Step 1: Add the failing test**

```python
def test_fwi_from_weather_returns_state_and_indices(cffdrs_reference):
    d = cffdrs_reference["single_day"]
    out = fwi.fwi_from_weather(
        temp=d["input"]["temp"], rh=d["input"]["rh"], wind=d["input"]["wind"],
        rain=d["input"]["rain"], month=d["input"]["month"],
        hemisphere=d["input"]["hemisphere"],
        prev=(d["prev"]["ffmc"], d["prev"]["dmc"], d["prev"]["dc"]),
    )
    assert round(out["fwi"], 1) == d["expect"]["fwi"]      # 10.1
    assert round(out["state"]["ffmc"], 1) == d["expect"]["ffmc"]  # 87.7
    assert round(out["state"]["dmc"], 1) == d["expect"]["dmc"]    # 8.5
    assert round(out["state"]["dc"], 1) == d["expect"]["dc"]      # 19.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_fwi.py::test_fwi_from_weather_returns_state_and_indices -q`
Expected: FAIL with `AttributeError: ... has no attribute 'fwi_from_weather'`.

- [ ] **Step 3: Add the implementation to `fire_danger/fwi.py`**

```python
def fwi_from_weather(temp: float, rh: float, wind: float, rain: float,
                     month: int, hemisphere: str,
                     prev: tuple[float, float, float]) -> dict:
    """Chain one day forward. `prev` is yesterday's (ffmc, dmc, dc).
    Returns {fwi, isi, bui, state: {ffmc, dmc, dc}}."""
    ffmc_prev, dmc_prev, dc_prev = prev
    new_ffmc = ffmc(temp, rh, wind, rain, ffmc_prev)
    new_dmc = dmc(temp, rh, rain, dmc_prev, month, hemisphere)
    new_dc = dc(temp, rain, dc_prev, month, hemisphere)
    isi_val = isi(wind, new_ffmc)
    bui_val = bui(new_dmc, new_dc)
    fwi_val = fwi(isi_val, bui_val)
    return {
        "fwi": fwi_val,
        "isi": isi_val,
        "bui": bui_val,
        "state": {"ffmc": new_ffmc, "dmc": new_dmc, "dc": new_dc},
    }


# CFFDRS default startup state, used to seed a brand-new zone's spin-up.
DEFAULT_STATE: tuple[float, float, float] = (85.0, 6.0, 15.0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_fwi.py -q`
Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/fwi.py tests/python/test_fwi.py
git commit -m "feat: chain FWI equations with carried state (fwi_from_weather)"
```

---

## Task 10: Danger classification

**Files:**
- Create: `fire_danger/classify.py`
- Test: `tests/python/test_classify.py`

- [ ] **Step 1: Write the failing test**

```python
from fire_danger.classify import danger_class, DANGER_CLASSES


def test_class_boundaries():
    assert danger_class(0.0) == "bajo"
    assert danger_class(4.9) == "bajo"
    assert danger_class(5.0) == "moderado"
    assert danger_class(11.0) == "alto"
    assert danger_class(24.0) == "muy alto"
    assert danger_class(40.0) == "extremo"


def test_classes_are_ordered_and_known():
    assert DANGER_CLASSES == ["bajo", "moderado", "alto", "muy alto", "extremo"]
    assert danger_class(-1.0) == "bajo"  # never below the floor
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_classify.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.classify'`.

- [ ] **Step 3: Write minimal implementation**

`fire_danger/classify.py`:

```python
"""Map an FWI value to a danger class. Thresholds are PROVISIONAL (Canadian-style
scale) and live in one place so Milestone 4 can recalibrate them against
GWIS/CEMS and the official TDF provincial semaphore without touching logic."""
from __future__ import annotations

DANGER_CLASSES = ["bajo", "moderado", "alto", "muy alto", "extremo"]

# Lower-bound thresholds (FWI >= bound → class). Provisional; tune in M4.
_THRESHOLDS = [
    (30.0, "extremo"),
    (21.0, "muy alto"),
    (10.0, "alto"),
    (5.0, "moderado"),
    (0.0, "bajo"),
]


def danger_class(fwi_value: float) -> str:
    for bound, label in _THRESHOLDS:
        if fwi_value >= bound:
            return label
    return "bajo"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_classify.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/classify.py tests/python/test_classify.py
git commit -m "feat: provisional FWI danger classification"
```

---

## Task 11: TDF zones

**Files:**
- Create: `fire_danger/zones.py`
- Test: `tests/python/test_zones.py`

- [ ] **Step 1: Write the failing test**

```python
from fire_danger.zones import ZONES, Zone


def test_two_tdf_zones_with_stable_ids():
    ids = [z.id for z in ZONES]
    assert ids == ["tdf-norte-estepa", "tdf-sur-bosque"]
    for z in ZONES:
        assert isinstance(z, Zone)
        assert z.province == "tierra-del-fuego"
        assert z.hemisphere == "south"
        # representative point sits inside its own bbox
        s, n, w, e = z.bbox
        assert s <= z.lat <= n
        assert w <= z.lng <= e
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_zones.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.zones'`.

- [ ] **Step 3: Write minimal implementation**

`fire_danger/zones.py`:

```python
"""Fire-danger zones, curated by fire behaviour (not departments/grid). v1 covers
Tierra del Fuego: northern steppe vs southern forest. The FWI is computed at the
representative point; polygons for map painting are a Milestone-2 concern, so no
geometry is stored here. IDs are stable — they key rows in `danger_zones`."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Zone:
    id: str
    province: str
    name: str
    lat: float
    lng: float
    hemisphere: str
    bbox: tuple[float, float, float, float]  # (south, north, west, east)


ZONES: list[Zone] = [
    Zone(
        id="tdf-norte-estepa",
        province="tierra-del-fuego",
        name="Norte / Estepa (Río Grande)",
        lat=-53.7878,
        lng=-67.7091,
        hemisphere="south",
        bbox=(-54.2, -52.6, -68.6, -66.4),
    ),
    Zone(
        id="tdf-sur-bosque",
        province="tierra-del-fuego",
        name="Sur / Bosque (Ushuaia–Tolhuin)",
        lat=-54.8019,
        lng=-68.3029,
        hemisphere="south",
        bbox=(-55.1, -54.2, -68.7, -66.9),
    ),
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_zones.py -q`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/zones.py tests/python/test_zones.py
git commit -m "feat: define Tierra del Fuego fire-danger zones"
```

---

## Task 12: Open-Meteo client

Produces one `DayWeather` per day: noon-local temperature/RH/wind plus 24h precipitation — the inputs the FWI expects. Forecast (today + 16 days) and historical (spin-up) share the daily-reduction logic.

**Files:**
- Create: `fire_danger/openmeteo.py`
- Test: `tests/python/test_openmeteo.py`
- Create: `tests/python/fixtures/openmeteo_forecast.json`

- [ ] **Step 1: Capture a real Open-Meteo response as a fixture**

Run (Río Grande, 2 days, the exact variables the client will request):

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=-53.7878&longitude=-67.7091&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&wind_speed_unit=kmh&timezone=America%2FArgentina%2FUshuaia&forecast_days=2" -o tests/python/fixtures/openmeteo_forecast.json
```

Confirm it has `hourly.time`, `hourly.temperature_2m`, `hourly.relative_humidity_2m`, `hourly.wind_speed_10m`, `hourly.precipitation` arrays. If the schema differs from what Step 3 parses, adjust the parser to match the real response (the live API is the source of truth, not this plan).

- [ ] **Step 2: Write the failing test**

```python
import json
from pathlib import Path

from fire_danger.openmeteo import parse_daily, DayWeather

FIX = Path(__file__).parent / "fixtures" / "openmeteo_forecast.json"


def test_parse_daily_reduces_hourly_to_days():
    raw = json.loads(FIX.read_text())
    days = parse_daily(raw, noon_hour=12)
    assert len(days) >= 1
    d0 = days[0]
    assert isinstance(d0, DayWeather)
    # noon values are taken from the hourly arrays; precip is the 24h sum
    assert d0.month in range(1, 13)
    assert d0.rh <= 100.0
    assert d0.precip >= 0.0
    assert d0.wind >= 0.0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest tests/python/test_openmeteo.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.openmeteo'`.

- [ ] **Step 4: Write minimal implementation**

`fire_danger/openmeteo.py`:

```python
"""Open-Meteo client. Reduces hourly weather to one record per local day:
noon-local temp/RH/wind and the 24h precipitation sum — the inputs the FWI
expects. Forecast and historical (archive) endpoints share `parse_daily`."""
from __future__ import annotations

from dataclasses import dataclass

import requests

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
TZ = "America/Argentina/Ushuaia"
_HOURLY = "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"


@dataclass(frozen=True)
class DayWeather:
    date: str          # YYYY-MM-DD (local)
    month: int
    temp: float
    rh: float
    wind: float        # km/h
    precip: float      # mm, 24h sum


def parse_daily(raw: dict, noon_hour: int = 12) -> list[DayWeather]:
    h = raw["hourly"]
    times = h["time"]
    temps = h["temperature_2m"]
    rhs = h["relative_humidity_2m"]
    winds = h["wind_speed_10m"]
    precs = h["precipitation"]

    # group hourly indices by local date
    by_date: dict[str, list[int]] = {}
    for i, ts in enumerate(times):
        by_date.setdefault(ts[:10], []).append(i)

    out: list[DayWeather] = []
    for date in sorted(by_date):
        idxs = by_date[date]
        # noon-local index: the hour whose "HH" == noon_hour, else the middle
        noon = next((i for i in idxs if int(times[i][11:13]) == noon_hour), idxs[len(idxs) // 2])
        precip = sum(precs[i] or 0.0 for i in idxs)
        out.append(DayWeather(
            date=date,
            month=int(date[5:7]),
            temp=float(temps[noon]),
            rh=float(rhs[noon]),
            wind=float(winds[noon]),
            precip=float(precip),
        ))
    return out


def _get(url: str, params: dict) -> dict:
    resp = requests.get(url, params=params, timeout=20)
    resp.raise_for_status()
    return resp.json()


def fetch_forecast(lat: float, lng: float, days: int = 16) -> list[DayWeather]:
    raw = _get(FORECAST_URL, {
        "latitude": lat, "longitude": lng, "hourly": _HOURLY,
        "wind_speed_unit": "kmh", "timezone": TZ, "forecast_days": days,
    })
    return parse_daily(raw)


def fetch_history(lat: float, lng: float, start_date: str, end_date: str) -> list[DayWeather]:
    raw = _get(ARCHIVE_URL, {
        "latitude": lat, "longitude": lng, "hourly": _HOURLY,
        "wind_speed_unit": "kmh", "timezone": TZ,
        "start_date": start_date, "end_date": end_date,
    })
    return parse_daily(raw)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_openmeteo.py -q`
Expected: PASS (1 passed).

- [ ] **Step 6: Commit**

```bash
git add fire_danger/openmeteo.py tests/python/test_openmeteo.py tests/python/fixtures/openmeteo_forecast.json
git commit -m "feat: Open-Meteo client (hourly → daily FWI inputs)"
```

---

## Task 13: Supabase I/O (PostgREST)

Mirrors `goes-sync.py`'s direct-`requests`/PostgREST style (no `supabase-py`, to keep the bundle lean). Read latest carried state per zone, upsert today's state, insert the forecast rows, and seed `danger_zones`.

**Files:**
- Create: `fire_danger/supabase_io.py`
- Test: `tests/python/test_supabase_io.py`

- [ ] **Step 1: Write the failing test (payload shaping is the pure, testable part)**

```python
from fire_danger.supabase_io import forecast_rows, state_row
from fire_danger.zones import ZONES


def test_forecast_rows_shape():
    zone = ZONES[0]
    computed = "2026-06-18"
    results = [
        {"target_date": "2026-06-18", "fwi": 10.1, "isi": 10.9, "bui": 8.5,
         "danger_class": "alto", "temp": 17.0, "rh": 42.0, "wind": 25.0, "precip": 0.0},
    ]
    rows = forecast_rows(zone.id, computed, results)
    assert rows[0] == {
        "zone_id": "tdf-norte-estepa", "computed_at": "2026-06-18",
        "target_date": "2026-06-18", "fwi": 10.1, "danger_class": "alto",
        "isi": 10.9, "bui": 8.5, "temp": 17.0, "rh": 42.0, "wind": 25.0, "precip": 0.0,
    }


def test_state_row_shape():
    assert state_row("tdf-sur-bosque", "2026-06-18", (87.7, 8.5, 19.0)) == {
        "zone_id": "tdf-sur-bosque", "date": "2026-06-18",
        "ffmc": 87.7, "dmc": 8.5, "dc": 19.0,
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_supabase_io.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.supabase_io'`.

- [ ] **Step 3: Write minimal implementation**

`fire_danger/supabase_io.py`:

```python
"""Supabase PostgREST I/O for the fire-danger engine. Direct `requests` to the
REST endpoint with the service-role key (same approach as api/goes-sync.py)."""
from __future__ import annotations

import os

import requests


def _base() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return url.rstrip("/"), key


def _headers(key: str, prefer: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json", "Prefer": prefer}


# --- pure payload shaping (unit-tested) ---
def forecast_rows(zone_id: str, computed_at: str, results: list[dict]) -> list[dict]:
    return [{
        "zone_id": zone_id, "computed_at": computed_at,
        "target_date": r["target_date"], "fwi": r["fwi"], "danger_class": r["danger_class"],
        "isi": r["isi"], "bui": r["bui"], "temp": r["temp"], "rh": r["rh"],
        "wind": r["wind"], "precip": r["precip"],
    } for r in results]


def state_row(zone_id: str, date: str, state: tuple[float, float, float]) -> dict:
    ffmc, dmc, dc = state
    return {"zone_id": zone_id, "date": date, "ffmc": ffmc, "dmc": dmc, "dc": dc}


# --- network I/O (covered by the Task 18 smoke test, not unit-mocked) ---
def latest_state(zone_id: str) -> tuple[float, float, float] | None:
    """Most-recent carried (ffmc, dmc, dc) for a zone, or None if never seeded."""
    url, key = _base()
    if not url or not key:
        return None
    resp = requests.get(
        f"{url}/rest/v1/fire_danger_state",
        params={"zone_id": f"eq.{zone_id}", "select": "ffmc,dmc,dc,date",
                "order": "date.desc", "limit": 1},
        headers=_headers(key, "return=representation"), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        return None
    r = data[0]
    return (r["ffmc"], r["dmc"], r["dc"])


def upsert_state(rows: list[dict]) -> None:
    url, key = _base()
    if not url or not key or not rows:
        return
    resp = requests.post(
        f"{url}/rest/v1/fire_danger_state",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=rows, timeout=20)
    resp.raise_for_status()


def insert_forecast(rows: list[dict]) -> None:
    url, key = _base()
    if not url or not key or not rows:
        return
    resp = requests.post(
        f"{url}/rest/v1/fire_danger",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=rows, timeout=30)
    resp.raise_for_status()


def seed_zones(zones: list) -> None:
    """Upsert zone definitions into danger_zones (id is the PK)."""
    url, key = _base()
    if not url or not key:
        return
    payload = [{
        "id": z.id, "province": z.province, "name": z.name,
        "lat": z.lat, "lng": z.lng,
        "bbox": list(z.bbox),
    } for z in zones]
    resp = requests.post(
        f"{url}/rest/v1/danger_zones",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=payload, timeout=20)
    resp.raise_for_status()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_supabase_io.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/supabase_io.py tests/python/test_supabase_io.py
git commit -m "feat: Supabase PostgREST I/O for fire-danger engine"
```

---

## Task 14: Spin-up seeding

When a zone has no carried state, replay ~30 real historical days from Open-Meteo to produce a valid `(ffmc, dmc, dc)` — so the zone is valid from day 1 (no cold 2–4 week spin-up). This is pure given a list of `DayWeather`, so it is unit-tested without the network.

**Files:**
- Create: `fire_danger/spinup.py`
- Test: `tests/python/test_spinup.py`

- [ ] **Step 1: Write the failing test**

```python
from fire_danger.spinup import replay_state
from fire_danger.openmeteo import DayWeather
from fire_danger import fwi


def _day(date, temp=15.0, rh=50.0, wind=10.0, precip=0.0):
    return DayWeather(date=date, month=int(date[5:7]), temp=temp, rh=rh, wind=wind, precip=precip)


def test_replay_returns_final_state_after_history():
    history = [_day(f"2026-05-{d:02d}") for d in range(1, 31)]
    state = replay_state(history, hemisphere="south")
    assert set(state) == {"ffmc", "dmc", "dc"}
    # 30 dry days → drought code climbs above the default 15.0
    assert state["dc"] > 15.0


def test_replay_empty_history_is_default_state():
    state = replay_state([], hemisphere="south")
    assert (state["ffmc"], state["dmc"], state["dc"]) == fwi.DEFAULT_STATE
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_spinup.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.spinup'`.

- [ ] **Step 3: Write minimal implementation**

`fire_danger/spinup.py`:

```python
"""Seed a new zone's FWI state by replaying ~30 real historical days, so the
zone reports valid values from day 1 instead of a cold 2–4 week spin-up."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.openmeteo import DayWeather


def replay_state(history: list[DayWeather], hemisphere: str) -> dict:
    """Chain DEFAULT_STATE through the historical days; return the final state."""
    state = fwi.DEFAULT_STATE
    for day in history:
        out = fwi.fwi_from_weather(
            temp=day.temp, rh=day.rh, wind=day.wind, rain=day.precip,
            month=day.month, hemisphere=hemisphere, prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
    return {"ffmc": state[0], "dmc": state[1], "dc": state[2]}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/python/test_spinup.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add fire_danger/spinup.py tests/python/test_spinup.py
git commit -m "feat: FWI spin-up seeding from historical weather"
```

---

## Task 15: The Vercel Function (endpoint + orchestration)

Thin handler (auth identical to `goes-sync.py`) that wires the package together: for each zone, get carried state (seed via spin-up if absent), fetch the 16-day forecast, chain the FWI forward day-by-day, classify, and persist state + forecast.

**Files:**
- Create: `api/fire-danger-sync.py`
- Modify: `vercel.json`
- Test: `tests/python/test_pipeline.py`

- [ ] **Step 1: Write the failing test for the pure orchestration core**

The orchestration is split so the day-chaining is pure and testable; only the outermost `run_pipeline()` touches the network.

```python
from importlib import import_module

# the endpoint filename has a hyphen → import via importlib
mod = import_module("api.fire-danger-sync".replace("-", "_")) if False else None
```

Because the file is `api/fire-danger-sync.py` (hyphen, not importable by name), put the pure core in the package instead and test it there:

```python
from fire_danger.pipeline import compute_zone_forecast
from fire_danger.openmeteo import DayWeather


def _day(date, temp, rh, wind, precip=0.0):
    return DayWeather(date=date, month=int(date[5:7]), temp=temp, rh=rh, wind=wind, precip=precip)


def test_compute_zone_forecast_chains_and_classifies():
    forecast = [
        _day("2026-06-18", 17.0, 42.0, 25.0),
        _day("2026-06-19", 20.0, 30.0, 30.0),
    ]
    start_state = (85.0, 6.0, 15.0)
    results, final_state = compute_zone_forecast(forecast, start_state, hemisphere="south")
    assert [r["target_date"] for r in results] == ["2026-06-18", "2026-06-19"]
    assert all(r["danger_class"] in
               {"bajo", "moderado", "alto", "muy alto", "extremo"} for r in results)
    # state carried forward changes from the start
    assert final_state != start_state
    # each row carries its drivers for the panel
    assert {"fwi", "isi", "bui", "temp", "rh", "wind", "precip"} <= set(results[0])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/python/test_pipeline.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'fire_danger.pipeline'`.

- [ ] **Step 3: Write `fire_danger/pipeline.py` (pure core)**

```python
"""Pure orchestration: chain a zone's forecast days forward and classify each.
No network — the endpoint feeds it weather and a start state."""
from __future__ import annotations

from fire_danger import fwi
from fire_danger.classify import danger_class
from fire_danger.openmeteo import DayWeather


def compute_zone_forecast(forecast: list[DayWeather],
                          start_state: tuple[float, float, float],
                          hemisphere: str) -> tuple[list[dict], tuple[float, float, float]]:
    state = start_state
    results: list[dict] = []
    for day in forecast:
        out = fwi.fwi_from_weather(
            temp=day.temp, rh=day.rh, wind=day.wind, rain=day.precip,
            month=day.month, hemisphere=hemisphere, prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        results.append({
            "target_date": day.date,
            "fwi": round(out["fwi"], 2),
            "isi": round(out["isi"], 2),
            "bui": round(out["bui"], 2),
            "danger_class": danger_class(out["fwi"]),
            "temp": day.temp, "rh": day.rh, "wind": day.wind, "precip": day.precip,
        })
    return results, state
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/python/test_pipeline.py -q`
Expected: PASS (1 passed).

- [ ] **Step 5: Write the endpoint `api/fire-danger-sync.py`**

```python
"""Fire-danger (FWI) daily sync endpoint.

Triggered by Supabase pg_cron once a day via pg_net HTTP GET. For each TDF zone:
read the carried (ffmc,dmc,dc) state (seed via spin-up if absent), fetch the
16-day Open-Meteo forecast, chain the FWI forward, classify, and persist the new
state + forecast rows to Supabase.

URL: GET /api/fire-danger-sync?secret=<CRON_SECRET>
Auth: same CRON_SECRET pattern as /api/goes-sync.

Env vars: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

from fire_danger import openmeteo, supabase_io, spinup
from fire_danger.pipeline import compute_zone_forecast
from fire_danger.zones import ZONES

SPINUP_DAYS = 30


def run_pipeline() -> dict:
    t0 = time.time()
    today = datetime.now(timezone.utc).date().isoformat()
    supabase_io.seed_zones(ZONES)

    zone_summaries = []
    for zone in ZONES:
        state = supabase_io.latest_state(zone.id)
        seeded = False
        if state is None:
            end = datetime.now(timezone.utc).date() - timedelta(days=1)
            start = end - timedelta(days=SPINUP_DAYS)
            history = openmeteo.fetch_history(zone.lat, zone.lng, start.isoformat(), end.isoformat())
            state = tuple(spinup.replay_state(history, zone.hemisphere).values())
            seeded = True

        forecast = openmeteo.fetch_forecast(zone.lat, zone.lng, days=16)
        results, final_state = compute_zone_forecast(forecast, state, zone.hemisphere)

        supabase_io.insert_forecast(supabase_io.forecast_rows(zone.id, today, results))
        # carry the state from the *first* forecast day (today)
        supabase_io.upsert_state([supabase_io.state_row(zone.id, today, final_state_for_today(results, state, zone))])
        zone_summaries.append({
            "zone": zone.id, "seeded": seeded, "days": len(results),
            "today_class": results[0]["danger_class"] if results else None,
        })

    return {"ok": True, "date": today, "zones": zone_summaries,
            "total_seconds": round(time.time() - t0, 2)}


def final_state_for_today(results, start_state, zone):
    """Re-derive the state right after today's day (results[0]) for the rolling
    carry. Recompute one step so the stored state is today's, not day+16's."""
    from fire_danger import fwi
    if not results:
        return start_state
    r0 = results[0]
    out = fwi.fwi_from_weather(
        temp=r0["temp"], rh=r0["rh"], wind=r0["wind"], rain=r0["precip"],
        month=int(r0["target_date"][5:7]), hemisphere=zone.hemisphere, prev=start_state)
    s = out["state"]
    return (s["ffmc"], s["dmc"], s["dc"])


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def _write_json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _is_authorized(self) -> bool:
        expected = os.environ.get("CRON_SECRET")
        if not expected:
            return False
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if qs.get("secret", [None])[0] == expected:
            return True
        auth_header = self.headers.get("Authorization", "") or ""
        return auth_header.startswith("Bearer ") and auth_header[7:] == expected

    def do_GET(self):  # noqa: N802
        if not self._is_authorized():
            self._write_json(401, {"error": "Unauthorized"})
            return
        try:
            self._write_json(200, run_pipeline())
        except Exception as exc:  # noqa: BLE001
            self._write_json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
```

> Note: the storage of the rolling state uses today's step only (`final_state_for_today`), while `compute_zone_forecast` returns the full 16-day forecast for `fire_danger`. This keeps `fire_danger_state` a true day-by-day chain (PK `(zone_id, date)`), and `fire_danger` the readable forecast.

- [ ] **Step 6: Register the function in `vercel.json` and tidy excludeFiles**

Replace the `functions` block so both Python functions exclude tests and each other's dead weight (no Python tree-shaking → everything reachable is bundled unless excluded):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "api/goes-sync.py": {
      "maxDuration": 300,
      "memory": 1024,
      "excludeFiles": "{scripts/**,public/**,docs/**,src/**,.next/**,node_modules/**,tests/**,fire_danger/**,**/__pycache__/**}"
    },
    "api/fire-danger-sync.py": {
      "maxDuration": 300,
      "memory": 1024,
      "excludeFiles": "{scripts/**,public/**,docs/**,src/**,.next/**,node_modules/**,tests/**,**/__pycache__/**}"
    }
  }
}
```

(The fire-danger function does **not** exclude `fire_danger/**` — it imports it. It does not need `boto3/xarray/netCDF4/pyproj`; those come from the shared `requirements.txt` but are never imported by this function, so they add bundle weight but no runtime cost. Verify bundle size stays under 500 MB after the first deploy — Task 18.)

- [ ] **Step 7: Run the full suite**

Run: `python -m pytest -q`
Expected: PASS (all tests across modules green).

- [ ] **Step 8: Commit**

```bash
git add fire_danger/pipeline.py api/fire-danger-sync.py vercel.json tests/python/test_pipeline.py
git commit -m "feat: fire-danger-sync Vercel Function + pipeline orchestration"
```

---

## Task 16: Supabase schema (versioned SQL — apply GATED)

**Files:**
- Create: `scripts/sql/whi-fwi-schema.sql`

- [ ] **Step 1: Write the schema file**

`scripts/sql/whi-fwi-schema.sql`:

```sql
-- Fire-danger (FWI) engine — Milestone 1 schema.
-- Pattern follows scripts/sql/whi-545-schema.sql (goes_*). RLS enabled,
-- anon/authenticated blocked; service_role bypasses (used by the function).

create table if not exists public.danger_zones (
  id            text primary key,
  province      text not null,
  name          text not null,
  lat           double precision not null,
  lng           double precision not null,
  bbox          double precision[] not null,   -- [south, north, west, east]
  geometry      jsonb,                          -- nullable; painted polygons land in M2
  created_at    timestamptz not null default now()
);

create table if not exists public.fire_danger_state (
  zone_id   text not null references public.danger_zones(id) on delete cascade,
  date      date not null,
  ffmc      double precision not null,
  dmc       double precision not null,
  dc        double precision not null,
  primary key (zone_id, date)
);

create table if not exists public.fire_danger (
  id            biggenerated by default as identity primary key,
  zone_id       text not null references public.danger_zones(id) on delete cascade,
  computed_at   date not null,
  target_date   date not null,
  fwi           double precision not null,
  danger_class  text not null,
  isi           double precision,
  bui           double precision,
  temp          double precision,
  rh            double precision,
  wind          double precision,
  precip        double precision,
  unique (zone_id, computed_at, target_date)
);

create index if not exists fire_danger_zone_target_idx
  on public.fire_danger (zone_id, target_date);

alter table public.danger_zones      enable row level security;
alter table public.fire_danger_state enable row level security;
alter table public.fire_danger       enable row level security;
-- No policies → anon/authenticated blocked; service_role bypasses RLS.
```

- [ ] **Step 2: Fix the identity syntax typo before applying**

`bigint generated by default as identity` is the correct form. Ensure the `fire_danger.id` column reads:

```sql
  id            bigint generated by default as identity primary key,
```

- [ ] **Step 3: Show the SQL and STOP for explicit OK**

Do **not** apply. Present the full file to the user and wait for an explicit "apply it". On OK, apply via the Supabase MCP `apply_migration` (name: `whi_fwi_schema`) against project `qmzuwnilehldvobjsbcs`. This is production (shared with SatAI) — `CREATE TABLE` only, no destructive statements, so it is additive, but still gated per the safety protocol.

- [ ] **Step 4: After apply — regenerate DB types in the same PR**

Per the repo convention, regenerate Supabase TS types so the (future) Next.js layer sees the new tables:

Run: `npx supabase gen types typescript --project-id qmzuwnilehldvobjsbcs > src/lib/database.types.ts`
(Confirm the actual types path first — grep for the existing generated types file; match its location.)

- [ ] **Step 5: Commit**

```bash
git add scripts/sql/whi-fwi-schema.sql
git commit -m "feat: fire-danger Supabase schema (danger_zones, fire_danger_state, fire_danger)"
```

---

## Task 17: pg_cron daily job (apply GATED)

**Files:**
- Create: `scripts/sql/whi-fwi-cron.sql`

- [ ] **Step 1: Write the cron file (mirrors scripts/sql/whi-545-cron.sql)**

`scripts/sql/whi-fwi-cron.sql`:

```sql
-- Daily fire-danger sync. ~06:00 ART = 09:00 UTC. Uses clara_cron_secret() so
-- the secret is never literal in cron.job.command (same as goes-sync).
select cron.schedule(
  'fire-danger-sync',
  '0 9 * * *',
  $$
  select net.http_get(
    url := 'https://alertaforestal.org/api/fire-danger-sync?secret=' || public.clara_cron_secret(),
    timeout_milliseconds := 290000
  );
  $$
);
```

- [ ] **Step 2: Show and STOP for explicit OK**

Do not schedule. Present the SQL; on OK, apply via the Supabase MCP. Verify afterwards with `select jobname, schedule from cron.job where jobname = 'fire-danger-sync';`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/whi-fwi-cron.sql
git commit -m "feat: daily pg_cron job for fire-danger-sync"
```

---

## Task 18: End-to-end smoke test + README + CLAUDE.md note

**Files:**
- Modify: `README.md` (API list)
- Modify: `CLAUDE.md` (architecture note)
- Modify: `TESTING.md` (a recipe)

- [ ] **Step 1: Live smoke test against the deployed function (after schema applied)**

With the branch deployed to a Vercel preview and the schema applied:

Run: `curl -s "https://<preview-url>/api/fire-danger-sync?secret=$CRON_SECRET" | python3 -m json.tool`
Expected: `{"ok": true, "date": "...", "zones": [{"zone": "tdf-norte-estepa", "seeded": true, "today_class": "...", ...}, {"zone": "tdf-sur-bosque", ...}], ...}`

Then verify persistence (Supabase MCP `execute_sql`, read-only):

```sql
select zone_id, count(*) from public.fire_danger group by 1;          -- ~16 rows/zone
select zone_id, date, ffmc, dmc, dc from public.fire_danger_state;     -- one row/zone (today)
```

A second call the same day must **not** duplicate forecast rows (UNIQUE + merge-duplicates) and must read the carried state instead of re-seeding (`seeded: false`).

- [ ] **Step 2: Check the bundle size**

In the Vercel deploy logs for `api/fire-danger-sync.py`, confirm the function bundle is well under 500 MB. If it is close (shared `requirements.txt` pulls xarray/netCDF4/boto3/pyproj), note it as a follow-up to split per-function requirements — out of scope for M1 unless it actually fails to deploy.

- [ ] **Step 3: Update docs**

- `README.md`: add `/api/fire-danger-sync` to the cron routes list.
- `CLAUDE.md`: under "API Routes — Cron", add the new route; under a short "Prevención (FWI)" note, point to the spec and this plan; add the 3 tables to the Supabase Tables section; add the `fire-danger-sync` pg_cron job.
- `TESTING.md`: add the curl recipe + the two verification queries from Step 1.

- [ ] **Step 4: Run the full suite one last time**

Run: `python -m pytest -q && npm run test`
Expected: Python suite green; existing Vitest suite unaffected.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md TESTING.md
git commit -m "docs: document fire-danger (FWI) engine route, tables, cron"
```

---

## Self-Review

**1. Spec coverage** (spec §-by-§):
- §5.1 Motor (Python, daily, Open-Meteo → cffdrs → classify → persist) → Tasks 3–15. ✅ (cffdrs replaced by native equations per the closed decision.)
- §5.2 Data model (`danger_zones`, `fire_danger_state`, `fire_danger`) → Task 16. ✅
- §5.3 Zones (curated by fire behaviour, representative point) → Task 11. ✅ (Polygon painting deferred to M2 — out of M1 scope, geometry nullable.)
- §5.4 Daily state + spin-up seeding → Tasks 9, 14. ✅
- §5.5 Calibration ("the C") → **explicitly deferred to Milestone 4** in the spec; provisional thresholds in Task 10. ✅ (gap is intentional)
- §6 Surfaces (page, bot alerts) → **Milestones 2 & 3, not this plan.** ✅ (out of scope)
- §7 Sources (Open-Meteo backbone) → Task 12. ✅
- §10 Risks (spin-up, resolution, thresholds) → Tasks 14, 12 (Open-Meteo auto-selects hi-res models per point), 10. ✅
- Southern-hemisphere correctness (not explicit in spec but essential) → Task 2. ✅ (added)

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" left. Every code step shows complete code; every test step shows the assertion; expected outputs and exact `pytest`/`curl` commands are given. The one external unknown — exact canonical FWI digits — is handled by a named oracle (cffdrs-R) with an explicit reconciliation rule, not a placeholder.

**3. Type consistency:**
- `fwi_from_weather` returns `{fwi, isi, bui, state:{ffmc,dmc,dc}}` — used identically in Tasks 9, 14 (`spinup`), 15 (`pipeline`, `final_state_for_today`). ✅
- `DayWeather(date, month, temp, rh, wind, precip)` — constructed in `openmeteo.parse_daily` and the test helpers (Tasks 12, 14, 15) with matching fields. ✅
- State is consistently a `(ffmc, dmc, dc)` tuple across `latest_state`, `replay_state` (returns dict → converted via `tuple(...values())`), `compute_zone_forecast`, `state_row`. ⚠️ **Watch:** `replay_state` returns a **dict**; Task 15 wraps it `tuple(spinup.replay_state(...).values())`. dict insertion order is ffmc,dmc,dc (Task 14 impl) so `.values()` order is correct — but during execution prefer adding an explicit `replay_state_tuple()` if the implicit ordering feels fragile.
- `forecast_rows`/`state_row` output keys match the `fire_danger`/`fire_danger_state` columns in Task 16. ✅
- `danger_class` returns one of `DANGER_CLASSES`; pipeline + tests assert membership. ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-fwi-engine.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with review between tasks and fast iteration. Best for keeping each task's context clean (the FWI equations are self-contained and verify against the fixture).
2. **Inline Execution** — execute tasks in this session via executing-plans, batched with checkpoints for review.

Which approach? (Note: Tasks 16–17 apply production SQL/cron — those stay gated behind your explicit OK regardless of execution mode, and nothing gets pushed without you asking.)
