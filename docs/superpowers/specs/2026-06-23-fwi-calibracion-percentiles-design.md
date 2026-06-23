# Calibración de clases de peligro FWI por percentiles locales

**Fecha:** 2026-06-23
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** Sub-proyecto 3 del milestone *validación → precisión → calibración → comprensión*. Precisión espacial quedó validada (sub-proyecto 2: Río Grande Spearman 0.899 vs CEMS). Las clases de peligro (`bajo→extremo`) usan **umbrales globales provisorios** (`classify.py`: 5/10/21/30) iguales para toda zona — un FWI de 23 es extremo en Ushuaia pero normal en Río Grande. Calibrarlas por zona es el primer paso para pasar del número técnico al lenguaje que entiende un ciudadano.

---

## 1. Problema y oportunidad

El **número** FWI ya está validado (reproduce el estándar oficial). Lo que NO está calibrado es el **mapeo número→clase**: hoy `danger_class()` aplica cortes globales fijos a todas las zonas. Eso ignora que cada zona tiene su propio clima base — la estepa de Río Grande vive en valores de FWI mucho más altos que el bosque húmedo de Ushuaia.

**Oportunidad:** calibrar los cortes `bajo→extremo` por zona, a partir de la distribución histórica del propio FWI de cada zona. "Alto" pasa a significar "un día más peligroso que el ~90% de los días de *esta* zona". Es el primer ladrillo de la diferencia con la página oficial del SMN: ellos publican el número crudo; nosotros lo traducimos a un nivel con sentido local.

## 2. Objetivos / No-objetivos

**Objetivos:**
- Calcular `p30/p70/p90/p97` de la serie histórica de FWI **por zona** (~10 años) y mapear las 5 clases a esos cortes.
- Persistir los umbrales calibrados como **JSON versionado** (`fire_danger/danger_thresholds.json`), generado offline.
- `classify.danger_class(fwi, zone_id)` usa los umbrales de la zona si existen; **fallback** a los globales provisorios si no.
- Aplicar en el pipeline (`compute_zone_forecast_grid` + `fire-danger-sync`) → las clases publicadas pasan a ser calibradas.

**No-objetivos:**
- Sacar la página `/provincia` de privada → es el sub-proyecto siguiente (**lenguaje ciudadano**), que cierra el milestone.
- Piso absoluto en las clases (ver §6) — se difiere; v1 es percentiles puros.
- Anclar al semáforo oficial SMN/provincia (no hay API; difiere al "slot de enriquecimiento").
- Generalizar a otras provincias; tunear umbrales en caliente.

## 3. Decisiones del brainstorming

| Decisión | Elegido | Razón |
|---|---|---|
| **Referencia** | Percentiles locales propios | Autónomo, reproducible, resuelve el problema real (mismo FWI = clase distinta según zona). Estándar Kiil/EFFIS. |
| **Ventana** | ~10 años (2013–2022) | Cola estable (~110 días en p97 vs ~44 con 4 años). Calibración única → vale la robustez. Viable por el cache resumible. |
| **Cortes** | p30 / p70 / p90 / p97 | Mayoría de días en bajo/moderado, peligro en la cola. Extremo ≈ top 3% (~11 días/año). |
| **Persistencia** | JSON versionado (como `grids/`) | Determinista, revisable en PR, sin DB. Cambiar umbrales es una decisión importante → pasa por PR. |
| **Piso absoluto** | No en v1 | YAGNI. Percentiles puros; código preparado para sumarlo si en la práctica resulta engañoso. |

## 4. Arquitectura

**En una línea:** un script offline calcula `p30/p70/p90/p97` de la serie diaria de FWI agregado por zona (~10 años, desde el cache resumible) y hornea `danger_thresholds.json`; `classify` lo lee por zona con fallback global.

### 4.1 Sobre qué serie se calibra
La **serie diaria del FWI agregado por zona (p95-de-grilla)** — exactamente el valor que producción publica y clasifica. Calibrar sobre la misma distribución que se clasifica (coherente con precisión espacial). ~10 años × 1 valor/día ≈ 3650 valores por zona.

### 4.2 Generación de la serie histórica (offline)
- Reusa el flujo de `compute_ours_grid.py` + el cache resumible (`fwi_cache.py`): baja **2013–2022** de FWI p95-de-grilla por zona. No usa CEMS (calibramos sobre *nuestra* serie).
- Parametrizar `YEARS` para cubrir 2013–2022. El cache `om_cache/` se extiende incrementalmente (a través de ventanas de quota Open-Meteo).
- Output: una serie diaria `(zona, fecha, fwi_p95)` por zona.

### 4.3 `calibrate.py` (offline, `scripts/fwi-validation/`)
- Lee la serie por zona, calcula `p30/p70/p90/p97` (reusa `aggregate.percentile`, ya testeado).
- Escribe `fire_danger/danger_thresholds.json`:
  ```json
  {"tdf-norte-estepa": {"moderado": <p30>, "alto": <p70>, "muy alto": <p90>, "extremo": <p97>},
   "tdf-sur-bosque":  {"moderado": <p30>, "alto": <p70>, "muy alto": <p90>, "extremo": <p97>}}
  ```
  (Los valores son los lower-bounds de cada clase por encima de `bajo`.)

### 4.4 `classify.py` (refactor, client-safe)
- `danger_class(fwi_value: float, zone_id: str | None = None) -> str`.
- Si `zone_id` tiene umbrales en el JSON → clasifica con esos (FWI ≥ bound → clase, de extremo hacia abajo).
- Si no (o `zone_id is None`) → **fallback** a `_THRESHOLDS` globales actuales. Preserva el contrato y el test existente (`danger_class(fwi)` sin zona sigue dando el global).
- Carga lazy + cacheada del JSON (sin deps nuevas; `json` + `pathlib`, igual que `grids/`).

### 4.5 Wiring
- `pipeline.py`: `compute_zone_forecast_grid` (y la `compute_zone_forecast` single) reciben/propagan `zone_id` a `danger_class`.
- `api/fire-danger-sync.py`: ya tiene `zone.id` → lo pasa.
- Frontend: **sin cambios** — `danger-panel.tsx`/`province-map.tsx` consumen `danger_class` ya computado en la tabla `fire_danger`; solo reciben clases ahora calibradas.

## 5. Data flow

```
calibrate (offline, una vez)
  cache 2013-2022 → serie FWI p95/zona → p30/p70/p90/p97 → danger_thresholds.json (versionado)

producción (cron diario)
  compute_zone_forecast_grid → danger_class(fwi, zone_id) → lee danger_thresholds.json
       → clases calibradas en fire_danger → página /provincia (privada)
```

## 6. Decisión diferida: piso absoluto

Percentiles puros comunican **anomalía local**, no peligro absoluto: en Ushuaia el p97 puede ser un FWI bajo en términos absolutos, así que "extremo para Ushuaia" no implica "fuego garantizado". **v1 usa percentiles puros** (estándar, simple). El JSON y `classify` quedan estructurados para que un futuro piso (`extremo = p97 AND fwi ≥ X`) sea un cambio aditivo, no un rediseño. Se evalúa tras ver las clases reales y el lenguaje ciudadano.

## 7. Manejo de errores y bordes
- **Zona sin umbrales en el JSON** → fallback global (degradación segura). Una zona nueva funciona con los provisorios hasta calibrarse.
- **JSON ausente/ilegible** → fallback global para todas las zonas; el motor nunca rompe por esto.
- **Percentiles no monótonos** (datos degenerados) → el script de calibración valida `p30<p70<p90<p97` y falla ruidoso antes de escribir un JSON inválido.
- **Serie demasiado corta** para una zona → el script avisa cuántos días tiene; no calibra zonas con datos insuficientes (quedan en fallback).

## 8. Testing (TDD)
- `calibrate`: percentiles correctos sobre una serie conocida; JSON con los 4 cortes/zona; monotonía garantizada.
- `classify`: con umbrales de zona, un FWI cae en la clase correcta; sin umbrales o `zone_id=None`, usa el fallback global; el test existente sigue verde; cortes de Río Grande > Ushuaia en valor absoluto.
- `pipeline`: `compute_zone_forecast_grid` con `zone_id` produce clases calibradas; sin zona, las globales.
- Sanidad (script, no unit): distribución resultante por zona (~30% bajo, ~3% extremo por construcción) y días/año por clase razonables; los umbrales por zona difieren.

## 9. Entregables
- `scripts/fwi-validation/calibrate.py` (+ extensión de `compute_ours_grid.py` a 2013–2022) + tests.
- `fire_danger/danger_thresholds.json` (generado, versionado).
- `fire_danger/classify.py` refactor (`zone_id`) + `fire_danger/pipeline.py` wiring + `api/fire-danger-sync.py`.
- Tests en `tests/python/` (classify, pipeline) y `scripts/fwi-validation/` (calibrate).
