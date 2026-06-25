# FWI province rollout — diseño

**Fecha:** 2026-06-23
**Estado:** diseño aprobado (brainstorming), pendiente de plan de implementación
**Rama:** `feat/fwi-province-rollout`

## 1. Motivación

La capa de prevención FWI hoy cubre solo Tierra del Fuego (2 zonas: `tdf-norte-estepa`,
`tdf-sur-bosque`). El objetivo es escalarla a las ~24 jurisdicciones argentinas, una por una
subiendo hacia el norte desde TDF, de forma repetible y con el mínimo trabajo manual.

La auditoría previa (`project_fwi_multiprovince_scaling`) confirmó que escalar es
data-as-code + re-correr scripts, sin rediseño del motor. Este diseño define **el proceso
repetible**, **el orden**, y **la automatización** del alta de cada provincia.

## 2. Decisiones (brainstorming)

1. **Unidad de zona = bioma, curada a mano.** Cada provincia se divide en 1-3 zonas
   homogéneas por bioma/comportamiento de fuego (estepa, bosque andino, monte, yungas,
   chaco…), como TDF. NO "una zona por provincia" — el FWI se promedia (p95) sobre la zona,
   y mezclar biomas distintos da resultados malos (TDF lo demostró: estepa vs bosque con
   cortes muy distintos, 44.73 vs 27.07).
2. **Las zonas las propone Claude, las valida el usuario.** El usuario no necesita conocer
   los biomas: Claude propone los recuadros (bbox) por bioma — apoyándose en geografía
   conocida + las ciudades de `argentina-cities.ts` como anclas — indicando qué bioma es y
   qué ciudades cubre cada zona. El usuario revisa (puede verlas dibujadas en la página
   `/provincia`) y aprueba/ajusta. Los bbox son aproximados; alcanza para biomas grandes y
   la calibración + CEMS opcional corrigen.
3. **Validación: confiar + solo calibrar.** El motor FWI ya reproduce el estándar CEMS
   (TDF Spearman ~0.9). Para cada zona nueva solo se baja el histórico y se calculan los
   umbrales por percentiles. CEMS solo si un bioma se comporta raro (no por provincia).
4. **Automatización (enfoque B): un comando "add-province".** Un script orquestador encadena
   los 3 pasos del pipeline existente (grilla → histórico → calibración) leyendo las zonas
   de la fuente única (`fire_danger/zones.py`), y elimina el `ZONE_OF` duplicado que hoy hay
   que mantener a mano en `compute_ours_grid.py` y `calibrate.py`.
5. **Sin SQL manual.** A diferencia de las alertas, agregar provincias NO toca la base de
   datos a mano: `seed_zones()` siembra las zonas en `danger_zones` en cada corrida del cron
   `fire-danger-sync`, y los umbrales viajan en `fire_danger/danger_thresholds.json` (bundle).
   El alta es solo código + push.

## 3. Proceso por provincia

1. **Definir zonas (Claude propone, usuario valida).** Agregar 1-3 `Zone(...)` a
   `fire_danger/zones.py` (id, province, name, lat/lng centroide, hemisphere='south', bbox),
   una por bioma. Claude propone; el usuario aprueba mirando las ciudades cubiertas (y/o el
   render en `/provincia`).
2. **Un comando.** `python scripts/fwi-validation/add_province.py <province-id>` corre, para
   cada zona nueva de esa provincia: `build_grids` (grilla terrestre vía Natural Earth) →
   `compute_ours_grid` (histórico Open-Meteo ~10 años, p95 diario, cache resumible) →
   `calibrate` (percentiles p30/p70/p90/p97 → actualiza `danger_thresholds.json[zone_id]`).
   Todo desatendido; ~20 requests Open-Meteo por zona (gratis).
3. **Publicar.** Commit (`zones.py` + `grids/<zone>.json` + `danger_thresholds.json`) + push
   a main → deploy. El cron `fire-danger-sync` da de alta las zonas (`seed_zones`) y empieza
   a pronosticar.
4. **Verificar.** La página `/provincia/<id>` muestra las zonas; en invierno darán "bajo"
   (esperado).

Tiempo/costo por provincia: ~1 h (mayormente desatendido), quota Open-Meteo gratis.

## 4. El orquestador `add_province` (nuevo)

`scripts/fwi-validation/add_province.py`:
- Toma un `province-id` (o `--all-new`: zonas en `zones.py` sin grilla/umbrales todavía).
- Para cada zona de esa provincia en `ZONES`: corre build_grids (si falta el JSON) →
  compute_ours_grid → calibrate, escribiendo `grids/<zone>.json` y mergeando en
  `danger_thresholds.json`.
- **Deriva las zonas de `zones.py`** (fuente única) — elimina el `ZONE_OF` duplicado.
  Refactor: `compute_ours_grid.py` y `calibrate.py` dejan de tener su propio `ZONE_OF`;
  reciben la lista de zonas a procesar como parámetro (las de la provincia).
- Idempotente: si una zona ya tiene grilla + umbrales, la saltea (salvo `--force`).
- Respeta el cache resumible (`om_cache/`) y el retry/backoff de Open-Meteo ya existentes.

## 5. Datos

- **Clima (histórico + forecast):** Open-Meteo, global, gratis, ya integrado. El comando lo
  baja solo. Nada que adquirir por provincia.
- **Forma de la tierra (grilla):** Natural Earth 50m land/lakes, ya versionado en el repo.
- **Referencia de biomas (para proponer bbox):** conocimiento geográfico + ciudades del repo
  + mapas de biomas públicos. No requiere procesar raster.
- **CEMS (validación):** solo si un bioma se comporta raro. Requiere cuenta EWDS + API key.
  Opcional, puntual, no por provincia.

## 6. Roadmap de provincias (orden)

Subiendo desde TDF hacia el norte, agrupado en fases por región/bioma (mayor a menor
señal/ruido). Se ejecuta de a una.

- **Fase 1 — Patagonia** (estepa + bosque andino; mejor señal/ruido): Santa Cruz, Chubut,
  Río Negro, Neuquén. ~2 zonas c/u.
- **Fase 2 — Centro / Cuyo / Córdoba:** La Pampa, Mendoza, San Juan, San Luis, Córdoba
  (sierras con incendios serranos fuertes). Monte árido + sierras. ~1-2 zonas c/u.
- **Fase 3 — Norte (NOA + Chaco):** Chaco, Formosa, Santiago del Estero, Tucumán, Salta,
  Jujuy, Catamarca, La Rioja. Bosque chaqueño seco + yungas. ~2-3 zonas c/u.
- **Fase 4 — Litoral / Mesopotamia:** Misiones (selva), Corrientes, Entre Ríos, Santa Fe.
  Matiz: Litoral/Delta es más problema de **humo** que de fuego a estructuras (ver
  `project_zonas_monitoreo_discusion`); decidir al llegar si se conecta con la capa de aire.
- **Fase 5 — Pampa húmeda (último/acotado):** Buenos Aires solo zonas serranas
  (Tandil / Sierra de la Ventana; el resto es campo agrícola, poco relevante). CABA se saltea.

Total: ~24 provincias × 1-3 zonas ≈ 40-50 zonas. El motor y el pipeline las soportan sin
cambios.

## 7. Qué NO cambia

Motor FWI (`fire_danger/`), schema de la DB (`danger_zones`/`fire_danger_state`/`fire_danger`),
cron `fire-danger-sync`, ruta `api/fire-danger-sync.py`, página `/provincia/[id]`, alertas de
prevención. Todo ya soporta N zonas.

## 8. Fuera de scope / follow-ons

- Publicar la página `/provincia` (sigue noindex) — decisión aparte.
- Extender la **detección** de focos a biomas no-forestales (tema de
  `project_zonas_monitoreo_discusion`) — capa distinta, no es este diseño.
- Litoral/Delta como feature de **humo/calidad de aire** — evaluar en Fase 4.
- Derivar zonas automáticamente de polígonos de biomas (MapBiomas) — descartado; las zonas
  se curan a mano.
- Polígonos finos de cada zona (hoy bbox) para visualización en la UI — opcional, más
  adelante.
