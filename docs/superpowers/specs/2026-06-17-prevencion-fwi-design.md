# Capa de prevención — Índice de peligro de incendio (FWI)

**Fecha:** 2026-06-17
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** Feedback de Leonardo (provincia de Tierra del Fuego) en la primera reunión: focalizar en **prevención** cruzando condiciones climáticas con los índices de peligro que la provincia ya maneja.

---

## 1. Problema y oportunidad

Hoy AlertaForestal es **detección reactiva**: avisa cuando ya hay un foco (GOES/FIRMS). El salto de valor es la **prevención proactiva**: avisar cuándo las **condiciones** son peligrosas para que se inicie un fuego — horas o días antes de que exista.

El cliente (manejo del fuego de TDF) lo pidió explícitamente. La diferencia de valor es temporal: la detección da minutos/horas una vez iniciado el fuego; la prevención da **días** de anticipación para pre-posicionar brigadas, restringir quemas y avisar a la población **antes** de la ignición.

## 2. Objetivos / No-objetivos

**Objetivos (v1, producto productivo, B2B-first):**
- Calcular un índice de peligro de incendio **por zona** para una provincia, con pronóstico (hoy + 24/48/72h, hasta 16 días).
- Exponerlo en una **página pública por provincia** con mapa (prevención + detección unificadas).
- Avisos **opt-in** vía el bot de Telegram existente (alerta por umbral + briefing diario).
- Generalizable de TDF a todas las provincias.

**No-objetivos (v1):**
- Capa cerrada/login para el equipo provincial (se difiere; todo público primero).
- Feed/API para sistemas de terceros (etapa madura).
- Ingerir el índice oficial provincial vía API (no hay API pública; se difiere al "slot de enriquecimiento").

## 3. Decisiones del brainstorming

- **Enfoque C (híbrido):** backbone = FWI propio calculado; enriquecimiento/validación con fuentes oficiales.
- **Motor compartido**, **superficie B2B primero**.
- **Página por provincia, pública** por ahora; capa de equipo (controles, gating) después.
- **Opt-in** del bot: nada se manda por default.
- **Estética y componentes actuales** del sitio: se reusan (mapa Leaflet, panel `/mapa`, cards, tipografías, paleta). Sin lenguaje visual nuevo.

## 4. Hallazgo clave de investigación

El índice oficial operativo de Argentina (**SNMF + SMN**) **es el FWI canadiense** ("Índice Meteorológico de Peligro de Incendios": FFMC/DMC/DC → ISI/BUI/FWI), calculado de temp/HR/viento/lluvia-24h, válido para el pico de las ~16:00, con pronóstico 24/48/72h y clases **bajo → moderado → alto → muy alto → extremo**. **TDF cae bajo el SNMF.**

→ Calcular el FWI nosotros **= reproducir el estándar oficial argentino**, no inventar una métrica. Credibilidad inmediata.

La provincia de TDF (Subsecretaría de Manejo del Fuego, Ley 1550/2024) publica su propio "índice de peligrosidad" por zona como **semáforo** diario (~10-11 AM). Metodología fina no publicada (probablemente FWI adaptado — a confirmar con Leonardo).

Ninguna fuente pública ofrece FWI por API en tiempo real con buena resolución sobre TDF (grids globales ~8-28 km son flojos sobre terreno/gradiente marítimo). Por eso se calcula localmente.

## 5. Arquitectura

### 5.1 Motor (backend)
Función Python nueva `api/fire-danger-sync.py` (mismo patrón que `api/goes-sync.py`), disparada por **pg_cron diario** (~6 AM). Por cada zona monitoreada:
1. **Open-Meteo** → temp, HR, viento, lluvia (hoy + 16 días; histórico para spin-up).
2. **cffdrs** (o `xclim`) → calcula FWI **arrastrando el estado del día anterior**.
3. Clasifica `bajo → moderado → alto → muy alto → extremo`.
4. Persiste en Supabase.

Python porque las librerías canónicas del FWI (`cffdrs`/`xclim`) son Python, y el patrón de función Python en Vercel ya está andando (GOES).

### 5.2 Modelo de datos (Supabase)
- `danger_zones` — `(id, province, name, lat, lng, bbox, geometry?, official_sector_ref?)`. Definición de zonas. Diseñada para **enchufar los sectores oficiales** de la provincia cuando se obtengan.
- `fire_danger_state` — `(zone_id, date, ffmc, dmc, dc)`. **Estado de humedad que se arrastra día a día.** PK `(zone_id, date)`.
- `fire_danger` — `(zone_id, computed_at, target_date, fwi, danger_class, temp, rh, wind, precip)`. **Lo que leen la página y las alertas.** UNIQUE `(zone_id, computed_at::date, target_date)`.

### 5.3 Zonas
- **Zonas curadas por comportamiento de fuego** (no departamentos ni grilla). En TDF: **Norte/estepa (Río Grande)** vs **Sur/bosque (Ushuaia–Tolhuin)**, ~2-3 zonas.
- Se reúsa el **pipeline de polígonos** existente (MapBiomas → gdal → mapshaper, el del filtro forestal). El FWI se calcula en un **punto representativo** por zona; el **polígono se pinta** por clase.
- `danger_zones` admite reemplazar/añadir las geometrías de los **sectores oficiales** de manejo del fuego cuando lleguen.

### 5.4 Estado diario y spin-up
El FWI arrastra estado (FFMC/DMC/DC dependen del valor de ayer). Al **dar de alta una zona**, se **siembra** el estado corriendo el cálculo sobre los **últimos ~30 días reales** (Open-Meteo Historical), de modo que la zona arranca con valores válidos **desde el día 1** (sin spin-up frío de 2-4 semanas).

### 5.5 Calibración (el "C")
Una vez, offline: bajar el **reanálisis FWI de GWIS/CEMS** (CDS API) para **ajustar los umbrales de clase** a TDF y validar la serie calculada. No está en el camino caliente.

## 6. Superficies

### 6.1 Página de provincia `/[provincia]` (pública, SSG/ISR)
- Mismo patrón que las páginas de ciudad. **Reusa el mapa Leaflet + el panel lateral** de `/mapa`, con zoom al bbox de la provincia.
- **Capa prevención:** zonas pintadas por clase + **slider de pronóstico** (hoy / 24 / 48 / 72h / …16 días).
- **Capa detección:** focos GOES/FIRMS activos (reúso).
- **Panel:** peligro por zona + drivers (temp / HR / viento / FWI) + tendencia.
- **SEO:** "Peligro de incendios en {Provincia}" + JSON-LD Place + OG (extiende lo existente).
- Datos vía `/api/fire-danger?province=…` o lectura directa en server component → tabla `fire_danger`.

### 6.2 Alertas + briefing (bot de Telegram existente, **opt-in**)
- **Alerta por umbral:** pg_cron revisa `fire_danger`; cuando una zona **cruza** a alto/extremo en el pronóstico (y antes no estaba), avisa a los suscriptos **con `prevention_enabled = true`** de esa zona. Dedup con tabla (patrón `goes_alerted`).
- **Briefing diario:** pg_cron matutino arma el resumen por provincia y lo manda a los suscriptos con `prevention_enabled = true`.

### 6.3 Onboarding del bot (opt-in)
- Campo nuevo `subscribers.prevention_enabled boolean default false` (mismo patrón que `lightning_enabled`).
- Tras compartir ubicación (paso existente), el bot **explica brevemente** qué recibe (resumen diario + aviso cuando su zona entra en peligro alto/extremo) y pregunta con **botones inline Sí / No**. Setea `prevention_enabled`.
- Suscriptos actuales: comando `/prevencion` para activar/desactivar (y, opcional, un anuncio único ofreciéndolo).
- **Opción de granularidad (a decidir en review):** un único opt-in (briefing diario + alertas) vs. dos niveles ("solo cuando hay peligro" vs "resumen diario") para quienes no quieren mensajes todos los días.

## 7. Fuentes de datos

| Fuente | FWI listo | Acceso | Rol |
|---|---|---|---|
| Open-Meteo | No (da inputs) | REST JSON, gratis CC-BY, 16 d | **Backbone** (calcular FWI) |
| GWIS/CEMS (Copernicus) | Sí | CDS API (reanálisis); forecast RT sin API limpia | Calibración/validación (offline) |
| NASA GFWED | Sí | descarga NetCDF, diario | Cross-check |
| SMN / CONAE (FFDI) | Sí (mapas) | imágenes/archivos, sin API | Referencia oficial / wording |
| FIRMS | No (fuego activo) | ya integrado | Detección (existente) |

Librerías FWI: `cffdrs` (Python) / `xclim`.

## 8. Generalización
El motor corre para las zonas de cualquier provincia. **TDF** es la primera totalmente calibrada (cliente). Sumar una provincia = definir sus zonas + sembrar estado + (opcional) calibrar umbrales.

## 9. Secuencia de entrega (milestones)
1. **Motor + datos:** función Python, tablas, zonas de TDF, spin-up sembrado. (Sin UI.)
2. **Página de TDF:** `/tierra-del-fuego` con mapa prevención + detección. **← entregable demostrable para Leonardo.**
3. **Opt-in + alertas + briefing** sobre el bot existente.
4. **Calibración** con GWIS + generalización a más provincias.

## 10. Riesgos y mitigaciones
- **Estado/spin-up del FWI** → siembra histórica desde Open-Meteo (zona válida día 1).
- **Resolución sobre TDF** → Open-Meteo autoselecciona modelos de alta resolución por punto; no usar grids globales gruesos como backbone.
- **Umbrales de clase** mal calibrados → validar contra reanálisis GWIS y, si se consigue, contra el semáforo oficial provincial.
- **Dependencia del índice oficial provincial** (no hay API) → no bloquea; entra por el slot de enriquecimiento cuando Leonardo lo facilite.
- **Costo Open-Meteo** → free 10k llamadas/día; arrancamos con pocas zonas.

## 11. Preguntas abiertas (para Leonardo)
- Nombre exacto del índice provincial y si es FWI-derivado.
- ¿Algún feed legible por máquina detrás del semáforo diario?
- Geometrías de los **sectores oficiales** de manejo del fuego de TDF.
- ¿Cobertura del FFDI de CONAE sobre TDF?

## 12. Estética / reúso
Reúso de: patrón de función Python (GOES), pipeline de polígonos (forestal), mapa + panel (`/mapa`), páginas SSG (ciudad), bot + patrón de alertas con dedup (`goes_alerted`), SEO. **Lo genuinamente nuevo:** el cálculo del FWI y su estado diario. Sin lenguaje visual nuevo — se mantiene la estética actual del sitio.
