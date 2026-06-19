# Validación del número FWI (vs CEMS) — Diseño

**Fecha:** 2026-06-19
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** El motor (M1) calcula el FWI y la página (M2) lo muestra por clase, pero las clases usan **umbrales provisionales sin validar**. Antes de calibrar las clases (sub-proyecto posterior), hay que confirmar que el **número** FWI que calculamos es confiable.

**Contexto — milestone mayor:** Este es el **sub-proyecto 1 de 4** del milestone "validación, calibración, precisión y comprensión", en este orden acordado:
1. **Validar el número** (este doc) — ¿nuestro FWI se mueve como el oficial?
2. **Precisión espacial** — grilla de puntos por zona + máscara de tierra + agregación.
3. **Calibrar las clases** — umbrales por percentiles climatológicos locales (método Kiil 1977: p30/p70/p90/p97), por zona.
4. **Comprensión ciudadana** — traducir clase + drivers a lenguaje claro.
Cada uno tiene su propio spec→plan. La calibración (3) depende del método de agregación de (2), por eso (2) va antes de (3).

---

## 1. Objetivo / No-objetivos

**Objetivo:** un análisis **offline, una sola vez** que compare nuestra serie histórica de FWI (calculada con nuestro motor desde Open-Meteo) contra el reanálisis oficial **CEMS** sobre Tierra del Fuego, y entregue un **veredicto**: ¿nuestro número es confiable, tiene un sesgo corregible, o hay un bug? El resultado da (o no) luz verde a invertir en la grilla y la calibración.

**No-objetivos:**
- No calibra las clases (eso es el sub-proyecto 3).
- No agrega la grilla de puntos (sub-proyecto 2).
- No toca producción ni el motor desplegado — es un script de análisis en `scripts/`.
- No automatiza una validación recurrente — se valida el **método** una vez.

## 2. Insight metodológico

Como las clases se calibrarán por **percentiles de nuestra propia serie**, la validación NO exige que nuestro número sea idéntico a CEMS — exige que **se mueva igual** (alta correlación). Un sesgo constante lo absorben los percentiles. El enemigo real es la **baja correlación** (indicaría un bug en las ecuaciones o inputs muy distintos), no un offset. → El criterio principal es la **correlación**; el sesgo es secundario (informativo).

## 3. Arquitectura

Análisis offline en `scripts/fwi-validation/`, mismo patrón que `scripts/goes-spike/` (Python, venv propio, produce un `REPORT.md` versionado). Tres pasos:

### 3.1 Referencia — CEMS (`fetch_cems.py`)
- Dataset **`cems-fire-historical-v1`**, variable **`fwi`**, vía la **CDS API de Copernicus** (`cdsapi`). ERA5-forzado, 0.25° (~28 km), cobertura global de tierra → TDF completo.
- Bajar el FWI diario para los píxeles que contienen los dos puntos de zona: **Río Grande (-53.7878, -67.7091)** y **Ushuaia (-54.8019, -68.3029)**.
- Período: **2014–2023** (10 años → varias temporadas de fuego australes).
- Guardar como CSV/parquet local (`cems_tdf.csv`).

### 3.2 Nuestro FWI histórico (`compute_ours.py`)
- Reusar el paquete `fire_danger` (las ecuaciones del motor) sobre **Open-Meteo Historical** para los mismos 2 puntos y el mismo período.
- Sembrar el estado (FFMC/DMC/DC) y **descartar los primeros ~30 días** por el spin-up antes de comparar.
- Tomar el valor de **12:00 local** (convención FWI) — igual que el motor de producción.
- Guardar `ours_tdf.csv`.

### 3.3 Comparación (`compare.py`)
- Alinear ambas series por `(punto, fecha)`.
- Métricas por punto:
  - **Correlación** Pearson y Spearman (principal).
  - **Sesgo medio** (nuestro − CEMS) y su desvío.
  - **Sesgo por temporada** (verano DEF/MAM vs invierno JJA/SON) — para detectar si el error depende del régimen.
  - Dispersión (RMSE, scatter plot).
- Generar gráficos (serie temporal superpuesta + scatter) y escribir `REPORT.md`.

## 4. Veredicto (criterios explícitos)

| Resultado | Interpretación | Acción |
|---|---|---|
| Correlación Spearman **> 0.85** y sesgo medio chico/estable | Número confiable | ✅ Luz verde a grilla + calibración por percentiles |
| Correlación alta pero **sesgo sistemático grande o estacional** | Inputs corridos (precip / hora / modelo) | Documentar el sesgo; calibración por percentiles sigue siendo válida (lo absorbe), pero anotar para no comparar números absolutos con terceros |
| Correlación **< 0.7** | Bug en ecuaciones o inputs muy distintos | 🛑 Investigar el motor antes de avanzar |

## 5. Gotchas a controlar (del research)
- **Spin-up:** descartar los primeros ~30 días de nuestra serie (el estado arrastrado necesita estabilizarse).
- **Precipitación:** confirmar unidades/acumulación 24h coherentes entre Open-Meteo y lo que el FWI espera (la lluvia resetea FFMC/DMC/DC y es la mayor fuente de divergencia).
- **Hora de cómputo:** ambos al pico ~12:00 local estándar.

## 6. Output
`scripts/fwi-validation/REPORT.md` — métricas por punto y temporada, gráficos, y el **veredicto** + recomendación para los sub-proyectos siguientes. (Referencia histórica, como `scripts/goes-spike/REPORT.md`.)

## 7. Prerequisito (del usuario)
Cuenta gratuita en **Copernicus CDS** + API key (`~/.cdsapirc` o variable de entorno). Sin la key no se puede bajar CEMS. Se documenta el paso de registro en el plan; el usuario lo configura (login interactivo, vía `! ...`).

## 8. Estructura de archivos
```
scripts/fwi-validation/
  requirements.txt        # cdsapi, xarray, netCDF4, pandas, scipy, matplotlib, requests
  fetch_cems.py           # baja CEMS FWI (2 puntos, 2014–2023) → cems_tdf.csv
  compute_ours.py         # nuestro FWI histórico (reusa fire_danger) → ours_tdf.csv
  compare.py              # alinea, métricas, gráficos → REPORT.md
  REPORT.md               # el reporte (commiteado)
  .gitignore              # ignora los CSV/NetCDF intermedios pesados
```
Los datos crudos (NetCDF/CSV) se gitignoran; solo el `REPORT.md` (y los gráficos chicos) se commitean.
