# FWI Validation (vs CEMS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm our Open-Meteo–based FWI moves like the official CEMS reanalysis over Tierra del Fuego — produce a `REPORT.md` with correlation/bias metrics and a verdict that green-lights (or blocks) the grid + percentile-calibration sub-projects.

**Architecture:** A standalone offline analysis under `scripts/fwi-validation/` (same pattern as `scripts/goes-spike/`: own venv, `requirements.txt`, produces a committed `REPORT.md`). Three steps — fetch the CEMS reference, compute our own historical FWI by reusing the `fire_danger` engine over Open-Meteo Historical, and compare them. No production code is touched.

**Tech Stack:** Python 3 (own venv), `cdsapi` (Copernicus EWDS), `xarray`/`netCDF4` (read CEMS NetCDF), `requests` (Open-Meteo), `pandas`/`scipy`/`matplotlib` (align + metrics + plots), and the repo's `fire_danger` package (the FWI equations, imported from the repo root).

---

## Decisiones cerradas (del spec `2026-06-19-fwi-validation-design.md`)
- **Una sola vez, offline.** No toca producción ni el motor desplegado.
- **2 puntos:** Río Grande (-53.7878, -67.7091), Ushuaia (-54.8019, -68.3029). **Período 2014–2023.**
- **Referencia:** CEMS `cems-fire-historical-v1`, variable FWI, vía CDS API del **EWDS** (`ewds.climate.copernicus.eu`).
- **Criterio principal:** correlación (un sesgo constante lo absorbe la calibración por percentiles posterior).
- **Verificación:** este trabajo se valida **corriendo los scripts y leyendo el output/REPORT**, no con TDD estricto (es análisis exploratorio). Solo la lógica pura de métricas lleva un test.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/fwi-validation/requirements.txt` | deps del análisis (cdsapi, xarray, netCDF4, requests, pandas, scipy, matplotlib) |
| `scripts/fwi-validation/.gitignore` | ignora datos crudos pesados (`*.nc`, `*.csv`) — solo se commitea REPORT + PNGs chicos |
| `scripts/fwi-validation/fetch_cems.py` | baja CEMS FWI (bbox TDF, 2014–2023) y extrae los 2 puntos → `cems_tdf.csv` |
| `scripts/fwi-validation/compute_ours.py` | nuestro FWI histórico en los 2 puntos (reusa `fire_danger`) → `ours_tdf.csv` |
| `scripts/fwi-validation/metrics.py` | funciones puras: alinear series + correlación + sesgo + sesgo por temporada (testeable) |
| `scripts/fwi-validation/compare.py` | usa `metrics.py`, genera plots + escribe `REPORT.md` |
| `scripts/fwi-validation/test_metrics.py` | test de `metrics.py` (la única lógica pura) |
| `scripts/fwi-validation/REPORT.md` | el reporte (commiteado) |

---

## Task 0: Prerequisito — credencial EWDS (acción del usuario)

No es código. Se documenta y se verifica antes de Task 2.

- [ ] **Step 1:** El usuario crea cuenta y acepta términos en `https://ewds.climate.copernicus.eu`, abre el dataset `cems-fire-historical-v1`, acepta los "Terms of use", y copia su API key del perfil.
- [ ] **Step 2:** Crear `~/.cdsapirc` con el endpoint del EWDS y la key:
```
url: https://ewds.climate.copernicus.eu/api
key: <UID>:<API-KEY>
```
(El formato exacto de `key` lo muestra la página "How to use the CDS/EWDS API" del propio sitio — copiarlo de ahí. Es el patrón estándar de cdsapi.)
- [ ] **Step 3:** Verificar la credencial:
```bash
python -c "import cdsapi; cdsapi.Client()"
```
Expected: no error (el cliente lee `~/.cdsapirc`). Si falla con "Missing/incomplete configuration", revisar el archivo.

---

## Task 1: Scaffold del análisis

**Files:**
- Create: `scripts/fwi-validation/requirements.txt`, `scripts/fwi-validation/.gitignore`

- [ ] **Step 1: requirements.txt**
```
cdsapi>=0.7.0
xarray>=2024.1.0
netCDF4>=1.6.5
requests>=2.31.0
pandas>=2.0.0
scipy>=1.11.0
matplotlib>=3.8.0
```

- [ ] **Step 2: .gitignore** (no commitear datos crudos)
```
*.nc
*.grib
cems_tdf.csv
ours_tdf.csv
venv/
__pycache__/
```

- [ ] **Step 3: venv + install**
```bash
cd scripts/fwi-validation
python3 -m venv venv
./venv/bin/pip install -q -r requirements.txt
```
Expected: instala sin error.

- [ ] **Step 4: Commit**
```bash
git add scripts/fwi-validation/requirements.txt scripts/fwi-validation/.gitignore
git commit -m "chore: scaffold fwi-validation analysis (deps + gitignore)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `fetch_cems.py` — bajar la referencia CEMS

**Files:**
- Create: `scripts/fwi-validation/fetch_cems.py`

- [ ] **Step 1: Implementar**

`fetch_cems.py` baja el FWI diario de `cems-fire-historical-v1` para un bbox que cubre los 2 puntos (Norte y Sur de TDF), 2014–2023, lo lee con xarray, extrae el píxel más cercano a cada punto, y escribe `cems_tdf.csv` con columnas `point,date,fwi_cems`.

```python
"""Download CEMS FWI reanalysis for the two TDF points (2014-2023) -> cems_tdf.csv.
Reference dataset to validate our Open-Meteo-based FWI against. Run once."""
import cdsapi
import xarray as xr
import pandas as pd

POINTS = {"rio_grande": (-53.7878, -67.7091), "ushuaia": (-54.8019, -68.3029)}
YEARS = [str(y) for y in range(2014, 2024)]
# bbox [North, West, South, East] covering both points, small margin
AREA = [-52.5, -69.0, -55.2, -66.0]
OUT_NC = "cems_fwi.nc"

def download():
    c = cdsapi.Client()
    # NOTE: copy the EXACT request from the dataset's "Show API request" button.
    # The shape below is the standard cems-fire-historical-v1 form; adjust the
    # variable/version names to match what that page generates if they differ.
    c.retrieve(
        "cems-fire-historical-v1",
        {
            "product_type": "reanalysis",
            "variable": "fire_weather_index",
            "dataset_type": "consolidated_dataset",
            "year": YEARS,
            "month": [f"{m:02d}" for m in range(1, 13)],
            "day": [f"{d:02d}" for d in range(1, 32)],
            "grid": "0.25/0.25",
            "area": AREA,
            "data_format": "netcdf",
        },
        OUT_NC,
    )

def extract():
    ds = xr.open_dataset(OUT_NC)
    # the FWI variable name in the file may be 'fwi' or similar — inspect ds.data_vars
    var = "fwinx" if "fwinx" in ds.data_vars else list(ds.data_vars)[0]
    rows = []
    for name, (lat, lng) in POINTS.items():
        series = ds[var].sel(latitude=lat, longitude=lng, method="nearest").to_series()
        for date, val in series.items():
            rows.append({"point": name, "date": pd.Timestamp(date).strftime("%Y-%m-%d"), "fwi_cems": float(val)})
    pd.DataFrame(rows).to_csv("cems_tdf.csv", index=False)
    print(f"wrote cems_tdf.csv: {len(rows)} rows")

if __name__ == "__main__":
    download()
    extract()
```

- [ ] **Step 2: Run + verify**
```bash
./venv/bin/python fetch_cems.py
```
Expected: descarga `cems_fwi.nc` (puede tardar varios minutos / quedar en cola en el CDS) y escribe `cems_tdf.csv` con ~7300 filas (2 puntos × ~3650 días). **Si el request es rechazado por nombres de variable/keys**, abrir la página del dataset, tocar "Show API request", y reemplazar el dict de `retrieve()` por el snippet exacto que genera. Inspeccionar `ds.data_vars` para el nombre real de la variable FWI y ajustar `var`.

- [ ] **Step 3: Commit (solo el script; el .nc/.csv están gitignored)**
```bash
git add scripts/fwi-validation/fetch_cems.py
git commit -m "feat: fetch CEMS FWI reanalysis for TDF points

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `compute_ours.py` — nuestro FWI histórico

**Files:**
- Create: `scripts/fwi-validation/compute_ours.py`

- [ ] **Step 1: Implementar (reusa el paquete `fire_danger`)**

Importa `fire_danger` desde la raíz del repo (3 niveles arriba), baja Open-Meteo Historical para cada punto (2014–2023), encadena el FWI día a día arrastrando el estado, descarta los primeros 30 días (spin-up), y escribe `ours_tdf.csv` con `point,date,fwi_ours`.

```python
"""Compute OUR FWI over 2014-2023 for the two TDF points by reusing the
fire_danger engine on Open-Meteo Historical -> ours_tdf.csv. Run once."""
import sys
import pathlib
import pandas as pd

# import the repo's fire_danger package (repo root is 2 levels up)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger import fwi as fwi_eq  # noqa: E402
from fire_danger import openmeteo  # noqa: E402

POINTS = {"rio_grande": (-53.7878, -67.7091), "ushuaia": (-54.8019, -68.3029)}
START, END = "2014-01-01", "2023-12-31"
SPINUP_DROP = 30  # days

def compute_point(lat, lng):
    days = openmeteo.fetch_history(lat, lng, START, END)  # list[DayWeather]
    state = fwi_eq.DEFAULT_STATE
    rows = []
    for d in days:
        out = fwi_eq.fwi_from_weather(
            temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
            month=d.month, hemisphere="south", prev=state)
        s = out["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        rows.append({"date": d.date, "fwi_ours": round(out["fwi"], 3)})
    return rows[SPINUP_DROP:]  # drop spin-up

if __name__ == "__main__":
    all_rows = []
    for name, (lat, lng) in POINTS.items():
        for r in compute_point(lat, lng):
            all_rows.append({"point": name, **r})
    pd.DataFrame(all_rows).to_csv("ours_tdf.csv", index=False)
    print(f"wrote ours_tdf.csv: {len(all_rows)} rows")
```

- [ ] **Step 2: Run + verify**
```bash
./venv/bin/python compute_ours.py
```
Expected: `ours_tdf.csv` con ~7240 filas (2 puntos × (~3650 − 30)). If Open-Meteo rejects a 10-year span in one call, the engineer should loop year-by-year and concatenate (note it in the report). Sanity-check: winter (JJA) FWI near 0, summer (DEF) higher.

- [ ] **Step 3: Commit**
```bash
git add scripts/fwi-validation/compute_ours.py
git commit -m "feat: compute our historical FWI for TDF points (reuses fire_danger)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `metrics.py` + test (la única lógica pura — TDD)

**Files:**
- Create: `scripts/fwi-validation/metrics.py`, `scripts/fwi-validation/test_metrics.py`

- [ ] **Step 1: Write the failing test** — `test_metrics.py`
```python
import pandas as pd
from metrics import align, season, compute_metrics

def test_align_joins_on_point_and_date():
    a = pd.DataFrame({"point": ["x"], "date": ["2020-01-01"], "fwi_ours": [10.0]})
    b = pd.DataFrame({"point": ["x"], "date": ["2020-01-01"], "fwi_cems": [9.0]})
    m = align(a, b)
    assert len(m) == 1 and m.iloc[0]["fwi_ours"] == 10.0 and m.iloc[0]["fwi_cems"] == 9.0

def test_season_maps_months():
    assert season("2020-01-15") == "verano"   # DEF (Jan) = austral summer
    assert season("2020-07-15") == "invierno"  # JJA (Jul) = austral winter

def test_metrics_perfect_correlation():
    df = pd.DataFrame({
        "point": ["x"]*4, "date": ["2020-12-01","2020-12-02","2020-07-01","2020-07-02"],
        "fwi_ours": [10.0, 20.0, 1.0, 2.0], "fwi_cems": [8.0, 18.0, 0.5, 1.5],
    })
    r = compute_metrics(df)
    assert r["spearman"] > 0.99            # monotonic
    assert abs(r["mean_bias"] - 1.25) < 1e-6  # ours - cems
    assert "verano" in r["bias_by_season"] and "invierno" in r["bias_by_season"]
```

- [ ] **Step 2: Run → fail**
```bash
./venv/bin/python -m pytest test_metrics.py -q
```
Expected: FAIL (`No module named 'metrics'`). (Install pytest in the venv if needed: `./venv/bin/pip install pytest`.)

- [ ] **Step 3: Implement `metrics.py`**
```python
"""Pure metrics for the FWI validation: align two series and compute
correlation + bias (overall and by austral season)."""
import pandas as pd
from scipy.stats import spearmanr, pearsonr

def align(ours: pd.DataFrame, cems: pd.DataFrame) -> pd.DataFrame:
    return ours.merge(cems, on=["point", "date"], how="inner")

def season(date_str: str) -> str:
    m = int(date_str[5:7])
    return "verano" if m in (12, 1, 2, 3) else "invierno" if m in (6, 7, 8, 9) else "transicion"

def compute_metrics(df: pd.DataFrame) -> dict:
    d = df.dropna(subset=["fwi_ours", "fwi_cems"])
    sp = spearmanr(d["fwi_ours"], d["fwi_cems"]).correlation
    pe = pearsonr(d["fwi_ours"], d["fwi_cems"])[0]
    mean_bias = float((d["fwi_ours"] - d["fwi_cems"]).mean())
    by_season = {}
    d = d.assign(_season=d["date"].map(season))
    for s, g in d.groupby("_season"):
        by_season[s] = float((g["fwi_ours"] - g["fwi_cems"]).mean())
    return {"n": len(d), "spearman": float(sp), "pearson": float(pe),
            "mean_bias": mean_bias, "bias_by_season": by_season}
```

- [ ] **Step 4: Run → pass**
```bash
./venv/bin/python -m pytest test_metrics.py -q
```
Expected: 3 passed.

- [ ] **Step 5: Commit**
```bash
git add scripts/fwi-validation/metrics.py scripts/fwi-validation/test_metrics.py
git commit -m "feat: pure FWI validation metrics (correlation + seasonal bias) + test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `compare.py` — plots + REPORT.md

**Files:**
- Create: `scripts/fwi-validation/compare.py`

- [ ] **Step 1: Implementar**

Lee `ours_tdf.csv` + `cems_tdf.csv`, usa `metrics.py`, genera por punto: un scatter (ours vs cems) + una serie temporal superpuesta, y escribe `REPORT.md` con la tabla de métricas y el veredicto según los criterios del spec.

```python
"""Compare our FWI vs CEMS: metrics + plots + REPORT.md."""
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from metrics import align, compute_metrics

def verdict(spearman: float) -> str:
    if spearman > 0.85:
        return "CONFIABLE — luz verde a grilla + calibración por percentiles."
    if spearman >= 0.7:
        return "ACEPTABLE con reservas — revisar sesgo/inputs antes de comparar números absolutos."
    return "PROBLEMA — correlación baja; investigar el motor/inputs antes de avanzar."

def main():
    ours = pd.read_csv("ours_tdf.csv")
    cems = pd.read_csv("cems_tdf.csv")
    merged = align(ours, cems)

    lines = ["# Validación FWI — nuestro motor vs CEMS reanalysis (TDF, 2014–2023)\n"]
    worst_sp = 1.0
    for point in sorted(merged["point"].unique()):
        sub = merged[merged["point"] == point]
        m = compute_metrics(sub)
        worst_sp = min(worst_sp, m["spearman"])
        lines.append(f"## {point}\n")
        lines.append(f"- n días: {m['n']}")
        lines.append(f"- Spearman: **{m['spearman']:.3f}** · Pearson: {m['pearson']:.3f}")
        lines.append(f"- Sesgo medio (nuestro − CEMS): {m['mean_bias']:+.2f}")
        lines.append(f"- Sesgo por temporada: {', '.join(f'{k} {v:+.2f}' for k,v in m['bias_by_season'].items())}\n")
        # scatter
        plt.figure(figsize=(4,4))
        plt.scatter(sub["fwi_cems"], sub["fwi_ours"], s=3, alpha=0.3)
        lim = max(sub["fwi_cems"].max(), sub["fwi_ours"].max())
        plt.plot([0,lim],[0,lim],"r--",lw=1); plt.xlabel("CEMS"); plt.ylabel("nuestro")
        plt.title(f"{point} FWI"); plt.tight_layout(); plt.savefig(f"scatter_{point}.png", dpi=80); plt.close()
        lines.append(f"![scatter {point}](scatter_{point}.png)\n")

    lines.append("## Veredicto\n")
    lines.append(verdict(worst_sp))
    pathlib_write = "\n".join(lines)
    with open("REPORT.md", "w") as f:
        f.write(pathlib_write)
    print("wrote REPORT.md; worst Spearman =", round(worst_sp, 3))

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run + verify**
```bash
./venv/bin/python compare.py
```
Expected: escribe `REPORT.md` + `scatter_*.png`, imprime el peor Spearman. Leer el REPORT y el veredicto.

- [ ] **Step 3: Commit (REPORT + PNGs; los CSV crudos quedan gitignored)**
```bash
git add scripts/fwi-validation/compare.py scripts/fwi-validation/REPORT.md scripts/fwi-validation/scatter_*.png
git commit -m "feat: FWI vs CEMS comparison report + plots

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Interpretar y decidir

- [ ] **Step 1:** Leer `REPORT.md`. Según el veredicto:
  - **Confiable** → cerrar este sub-proyecto; arrancar el spec de la **grilla espacial** (sub-proyecto 2).
  - **Sesgo grande / estacional** → documentar en el REPORT que la calibración por percentiles lo absorbe, pero anotar el offset; igual se puede avanzar.
  - **Correlación baja** → abrir un mini-debug: revisar precipitación (unidades/24h), hora de cómputo (12:00), y el spin-up, comparando algunos días puntuales nuestro vs CEMS.
- [ ] **Step 2:** Actualizar la memoria del proyecto con el veredicto.

---

## Self-Review

**Spec coverage:** §3.1 CEMS fetch → Task 2 ✅ · §3.2 nuestro FWI (reusa fire_danger, spin-up, 12:00) → Task 3 ✅ · §3.3 comparación (correlación + sesgo + por temporada) → Tasks 4–5 ✅ · §4 veredicto → Task 5 `verdict()` + Task 6 ✅ · §6 REPORT.md → Task 5 ✅ · §7 prerequisito CDS → Task 0 ✅ · §8 estructura de archivos → File Structure ✅.

**Placeholder scan:** El único punto "abierto" deliberado es la request exacta de `cdsapi` (Task 2) — pero se resuelve con la fuente autoritativa ("Show API request" del dataset), no con una suposición; es la práctica correcta del CDS. Todo lo demás tiene código concreto.

**Type consistency:** `align`/`season`/`compute_metrics` definidas en `metrics.py` (Task 4) y usadas idénticas en `compare.py` (Task 5). CSV columns `point,date,fwi_ours` (Task 3) y `point,date,fwi_cems` (Task 2) coinciden con el `merge` de `align`. `fire_danger.fwi_from_weather` / `DEFAULT_STATE` / `openmeteo.fetch_history` usados con la firma real del motor. ✅

---

## Execution Handoff

Plan completo y guardado en `docs/superpowers/plans/2026-06-19-fwi-validation.md`. Dos opciones de ejecución:

1. **Subagent-Driven (recomendado)** — un subagente por task, con revisión entre tasks.
2. **Inline** — en esta sesión, por lotes.

**Importante:** Task 2 (bajar CEMS) **bloquea** en el prerequisito de tu cuenta EWDS (Task 0) — sin la API key configurada no corre. Tasks 1, 3, 4, 5 (scaffold, nuestro FWI, métricas, comparación) **no** dependen de CEMS y se pueden adelantar; el reporte final (Task 5) sí necesita el CSV de CEMS.

¿Qué approach? ¿O preferís que arranque por las tasks que no dependen de tu cuenta (1, 3, 4) mientras configurás la EWDS?
