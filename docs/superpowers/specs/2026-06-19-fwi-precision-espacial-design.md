# Precisión espacial FWI — grilla de puntos por zona

**Fecha:** 2026-06-19
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** Sub-proyecto 2 del milestone *validación → precisión → calibración → comprensión*. La validación (sub-proyecto 1) dio luz verde (Spearman 0.91 en Río Grande vs CEMS). Hoy el FWI se calcula en **un solo punto representativo por zona**; para que el peligro publicado represente a toda la zona (y para que la calibración por percentiles se haga sobre la distribución correcta) hay que pasar a una **grilla de puntos** agregada.

---

## 1. Problema y oportunidad

El pipeline actual (`api/fire-danger-sync.py` + `fire_danger/`) computa el FWI en **1 punto por zona** (`zone.lat`, `zone.lng`). Dos limitaciones:

1. **Representatividad:** una zona como "Norte / Estepa" abarca ~1.6°×2.2°. Un punto no captura que la estepa interior puede estar en peligro extremo mientras la costa atlántica no. El peligro publicado puede subestimar el peor sector — justo donde un incendio arranca.
2. **Calibración correcta:** el sub-proyecto siguiente calibra los umbrales de clase (`bajo → extremo`) por **percentiles locales**. Esos percentiles deben calcularse sobre la **misma serie** que producción va a clasificar. Si calibramos sobre 1-punto y clasificamos sobre una agregación de grilla, los umbrales no corresponden a la distribución real.

**Oportunidad:** introducir una grilla espacial agregada como **capacidad compartida** entre el cálculo histórico (insumo de la calibración) y el pipeline diario (clasificación productiva), garantizando que ambos midan lo mismo.

## 2. Objetivos / No-objetivos

**Objetivos:**
- Generar una **grilla estática de puntos-en-tierra por zona** (densidad 0.2°, máscara Natural Earth 50m), versionada y regenerable.
- Calcular el FWI **encadenado por punto** y agregarlo a un valor de zona por **percentil 95**.
- Exponer la agregación como **una función pura compartida**, usada idénticamente en el histórico y en producción.
- Aplicar la grilla en el **pipeline diario** (`fire-danger-sync.py`), persistiendo el estado por punto de forma additive.
- **Cerrar el loop de validación:** re-correr nuestro FWI sobre grilla vs CEMS y confirmar que la correlación no se degrada.

**No-objetivos (este sub-proyecto):**
- Calibración de umbrales por percentiles → sub-proyecto siguiente (este solo le entrega la serie agregada).
- Lenguaje ciudadano / hacer pública la página → sub-proyectos posteriores.
- Densidad adaptativa, interpolación espacial, o suavizado entre puntos.
- Nuevas zonas fuera de TDF; cambiar el `lat/lng` representativo de la zona; tocar la UI de la página.

## 3. Decisiones del brainstorming

| Decisión | Elegido | Razón |
|---|---|---|
| **Alcance** | Capacidad compartida + aplicar en producción | El histórico para calibrar debe generarse con el mismo método de agregación que clasifica producción. |
| **Densidad** | 0.2° (~22 km), ~50 puntos/zona en tierra | El dato de fondo (ERA5-Land) no tiene más detalle que ~11 km; 0.2° captura la variación meso sin inflar cómputo. |
| **Agregación** | Percentil 95 | Casi tan sensible como `max` al peor sector, pero robusto a un pixel artefacto de borde costa/montaña. |
| **Máscara de tierra** | Pre-computar offline y hornear | La grilla es estática; correr Natural Earth una vez y versionar la lista evita meter `shapely`/GDAL en la Vercel Function. |
| **Estado encadenado** | Por punto, persistido como blob JSON additive | El DC/DMC arrastran meses de historia; compartir estado borra la heterogeneidad espacial que la grilla busca capturar. |
| **Componentes de la fila** | Del "punto líder" que define el p95 | Una fila consistente con un punto real, no un Frankenstein de percentiles independientes por componente. |

## 4. Arquitectura

**En una línea:** grilla estática de puntos-en-tierra por zona → FWI encadenado por punto → **agregación p95** compartida entre histórico (calibración) y producción (clasificación).

### 4.1 Generación de la grilla (offline, una vez)
- **Script nuevo** `scripts/fwi-validation/build_grids.py`:
  - Por cada zona, genera puntos cada **0.2°** dentro del `bbox` (`Zone.bbox = (south, north, west, east)`).
  - Descarta puntos sobre agua con **Natural Earth 50m** (`land` menos `lakes`): saca Océano Atlántico, Canal Beagle, Estrecho de Magallanes, Lago Fagnano.
  - Escribe la lista de puntos-en-tierra a **`fire_danger/grids/<zone_id>.json`** (precisión 4 decimales).
- `shapely`/`geopandas`/`pyshp` viven **solo en el venv de validación** (`scripts/fwi-validation/requirements.txt`), nunca en producción.
- Determinista y regenerable; el JSON queda versionado y revisable en el PR.

### 4.2 Componentes nuevos en `fire_danger/` (client-safe, sin deps geoespaciales)
- **`grids.py`** — `grid_points(zone_id) -> list[tuple[float, float]]`. Carga y cachea `grids/<zone_id>.json`. Si una zona no tiene grilla, hace fallback al punto representativo `[(zone.lat, zone.lng)]` (degradación segura).
- **`aggregate.py`** — `aggregate_fwi(values: list[float]) -> float` = percentil 95 (interpolación lineal, stdlib). **Pieza central**, pura y testeada; idéntica en ambos lados. También `leader_index(values) -> int` = índice del punto cuyo FWI está más cerca del p95, para elegir los componentes de la fila.
- **`openmeteo.py`** — extender a **multi-punto**: Open-Meteo acepta `latitude`/`longitude` coma-separados y devuelve un array de bloques `hourly`, así que ~50 puntos = ~1–2 requests, no 50. Nuevas funciones `fetch_forecast_multi(points, days)` y `fetch_history_multi(points, start, end)` que devuelven `list[list[DayWeather]]` (una serie por punto), reusando `parse_daily` por bloque. Las funciones de un punto se conservan (retrocompat + fallback).

### 4.3 Pipeline (compartido)
- **`pipeline.py`** — `compute_zone_forecast_grid(per_point_forecasts, per_point_state, hemisphere) -> (results, carry_states)`:
  - Para cada punto: encadena el FWI día a día con su propio estado (reusa la lógica de 1-punto existente).
  - Por cada día: junta los N FWI de ese día, calcula `aggregate_fwi` (p95), clasifica sobre el valor agregado, y toma `temp/rh/wind/precip/isi/bui` del **punto líder** (`leader_index`).
  - Devuelve los `carry_states` de **todos** los puntos para persistir.
- La función de 1-punto actual (`compute_zone_forecast`) se mantiene; la de grilla la envuelve (una grilla de 1 punto debe reproducir exactamente el resultado de 1-punto).

### 4.4 Persistencia (producción) — additive, gated
- **Migración SQL** en `scripts/sql/` (additive, presentar y esperar OK explícito antes de aplicar a producción `qmzuwnilehldvobjsbcs`):
  - Agregar columna `grid_state jsonb` a `fire_danger_state` (array de `{ffmc, dmc, dc}` por punto, en el orden de la grilla). **Una fila por zona/día**; no se toca el PK `(zone_id, date)` ni las columnas escalares existentes (retrocompat).
- `supabase_io.py`: leer/escribir `grid_state`; el spin-up (~30 días) corre **por punto** cuando no hay estado previo.
- `fire-danger-sync.py`: `_sync_zone` usa `grid_points(zone)` → `fetch_*_multi` → `compute_zone_forecast_grid` → persiste `grid_state` + las filas `fire_danger` agregadas. El forecast diario de ~50 puntos × 2 zonas entra en ~2–4 requests a Open-Meteo.

### 4.5 Validación (cierre del loop, offline)
- Adaptar `scripts/fwi-validation/compute_ours.py` para computar la serie **sobre la grilla** (p95) en Río Grande y Ushuaia, y re-correr `compare.py` vs CEMS.
- **Criterio de éxito:** el Spearman **no baja** respecto del 1-punto (idealmente sube en Ushuaia, la más ruidosa). Si bajara, investigar antes de avanzar a calibración.

## 5. Data flow

```
build_grids.py (offline, 1 vez)
  bbox + Natural Earth 50m → fire_danger/grids/<zone>.json   (versionado)

Histórico (offline, insumo de calibración)
  grids → fetch_history_multi → FWI por punto → aggregate_fwi(p95) → serie/zona

Producción (cron diario)
  grids → fetch_forecast_multi → compute_zone_forecast_grid
        → fire_danger (FWI p95 + componentes del líder)
        → fire_danger_state.grid_state (N estados/zona)
```

## 6. Manejo de errores y bordes
- **Zona sin JSON de grilla:** fallback a `[(zone.lat, zone.lng)]` → comportamiento idéntico al actual.
- **Open-Meteo multi-punto falla parcial:** si faltan series de algunos puntos, agregar sobre los disponibles y registrar cuántos puntos se usaron (no abortar la zona). Si faltan todos, la zona falla aislada (el resto sigue, como hoy).
- **`grid_state` ausente/longitud distinta a la grilla** (p. ej. tras regenerar la grilla con otra densidad): tratar como "sin estado" → re-spin-up por punto. Evita encadenar estados desalineados.
- **Punto sobre agua que se coló:** la máscara es la defensa; un punto marítimo residual daría FWI bajo (alta HR) y no infla el p95.

## 7. Testing (TDD)
- `aggregate.py`: p95 con lista uniforme, con outlier alto, n chico (2–3 puntos), y equivalencia con n=1; `leader_index` apunta al valor correcto.
- `grids.py`: carga del JSON, ningún punto fuera del `bbox`, fallback a punto representativo cuando falta el archivo.
- `openmeteo` multi-punto: parseo de respuesta multi-bloque → N series; orden preservado.
- `pipeline`: dos puntos con clima distinto producen **estados distintos** (no se comparten); el día agregado usa el p95 correcto; **no-regresión**: grilla de 1 punto == resultado de 1-punto actual.
- Validación: la corrida grilla vs CEMS produce métricas y no degrada el Spearman.

## 8. Riesgos
- **Costo/latencia Open-Meteo:** mitigado por multi-punto (1–2 requests/zona) y, en el histórico, chunking por año como ya hace `compute_ours.py`.
- **Build de producción:** mitigado por hornear la máscara offline — la Vercel Function no gana dependencias.
- **Tamaño de `grid_state`:** ~50 objetos `{ffmc,dmc,dc}` por zona/día en JSON es trivial (< 4 KB).
