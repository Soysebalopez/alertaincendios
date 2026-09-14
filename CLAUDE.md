@AGENTS.md

# AlertaForestal

Alertas tempranas de incendios forestales en Argentina vía Telegram. El bot del servicio se llama **Clara** (antes el proyecto se llamaba C.L.A.R.A.; "Clara" quedó como persona del bot, y el sitio pasó a ser AlertaForestal.org). Detección dual: GOES-19 (10 min, preliminar) + NASA FIRMS (15 min, confirmado). Gratuito B2C, complementario a Satellites On Fire.

## Stack
- Next.js 16 + TypeScript + Tailwind CSS v4 + Motion + Phosphor Icons + Leaflet + Recharts
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs) — Postgres + pg_cron + pg_net + Auth
- Vercel Hobby — Next.js routes (TS) + Python Vercel Functions (`api/goes-sync.py`, `api/fire-danger-sync.py`, `api/glm-sync.py`, `api/smn-wrf-sync.py`)
- Groq llama-3.3-70b (AI citizen summaries + interpretation)
- Python pipeline: xarray, netCDF4, boto3, pyproj — procesa GOES NetCDF en Vercel

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios (repo conserva el nombre viejo)
- Linear: proyecto AlertaForestal en el team Growing Bay Products (WHI)
- Deploy: Vercel — dominio principal https://alertaforestal.org (alias: alertaincendios.vercel.app)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @alertaforestal_bot (persona del bot: Clara)

## Design System
- Font: Outfit (headings + body) + Geist Mono (data/labels)
- Palette: near-black (#0a0a08), warm beige foreground (#d4d4cc), burnt orange accent (#e8622c)
- Surfaces: #121210, #1a1a17 — borders: #252520 — muted: #8a8a7e
- Coordinate grid overlay (60px, masked radial fade) + soft SVG grain overlay (`.grain`, fractalNoise, mix-blend overlay)
- Ember particles (CSS, float up), thermal-pulse / beacon-ping live indicators
- Nav text uses color-mix(in oklab, foreground 80%, transparent)

## Architecture

### Pages
- Landing: `/` — split-screen hero (fire count + Leaflet map), live city slider, 6 data sources (3×2 grid), "Cómo funciona", evolución de focos, calidad del aire, CTA "Recibí la alerta antes"
- Mapa: `/mapa` — fullscreen Leaflet con capas focos/aire/viento. Layout propio (sin footer)
- Calidad del aire: `/calidad-aire` — selector de provincia → cards por ciudad
- Ciudad: `/ciudad/[province]/[city]` — SSG 78 páginas, dashboard completo por ciudad
- Bahía Blanca: `/bahia-blanca` — página propia (WHI-907). Muestra **todos los focos de vegetación** sin antorchas industriales (Bahía no está en ninguna zona forestal), el mapa con el cono de humo y frente, `?foco=<lat>,<lng>` para centrarlo en un foco (sólo a <100 km), viento medido del aeropuerto (METAR SAZB), rayos GLM, historial medido y el deep link del bot `ciudad-bahia-blanca`. Los paneles de viento y rayos no se muestran si su tabla no existe o el dato está vencido. `/ciudad/buenos-aires/bahia-blanca` redirige acá (308)
- Historial: `/historial` — Recharts evolución de focos
- Cómo funciona: `/como-funciona` — FAQ ciudadano (8 preguntas, sin jerga)
- ~~Cuarteles~~: la función de bomberos voluntarios (rol, códigos de invitación, `/cuarteles`, `/soybombero`) **se retiró el 2026-09-14 sin haberse usado nunca** (WHI-907). `/cuarteles` redirige a `/`. Las tablas `fireman_codes` / `fireman_code_usage` y la columna `subscribers.cuartel_name` siguen en la base hasta el borrado con OK explícito
- Dashboard: `/dashboard`, `/dashboard/alerts`, `/dashboard/health`, `/dashboard/superadmin` — métricas internas (`superadmin` agrega breakdown de subscribers, funnel GOES, latencias, forest split), gated por Supabase Auth allowlist (soysebalopez@gmail.com)
- Login: `/login` — entry point del dashboard

### Route Groups
- `(main)` — Nav + Footer + EmberParticles (landing, historial, calidad-aire, ciudad, como-funciona)
- `/mapa` — Nav + EmberParticles, no footer
- `/dashboard/*` — layout propio con nav minimalista + signout, gated por middleware
- `/login` — sin layout, página standalone

### API Routes — Públicas
- `/api/fires` — focos confirmados desde fires_cache
- `/api/fires/history?months=N` — agregación diaria
- `/api/air-quality?lat=X&lng=Y` — Open-Meteo CAMS (NO2/SO2/O3/CO/PM25/PM10 + nivel OMS)
- `/api/wind?lat=X&lng=Y` — viento + temp + humedad
- `/api/summary?lat=X&lng=Y&city=Name` — Groq summary
- `/api/history?lat=X&lng=Y&pollutant=NO2&days=7` — historial por contaminante
- `/api/simulate` — POST, dispersión gaussiana (Pasquill-Gifford). Modelo de fuga de gas: **no usarlo para pastizal**
- `/api/fire-projection?lat=X&lng=Y&confirmed=1` — GeoJSON de un foco (WHI-907): sector de humo a sotavento (±15°, hasta 3 h) y, si está confirmado y aplica la regla CSIRO del 20%, isócronas del frente a +30/+60/+120/+180 min. Con viento de fallback (inventado) no dibuja nada y no se cachea; si no, cache 10 min
- `/api/bot/telegram` — webhook Telegram
- `/api/bot/sync-commands` — registra el menú nativo del bot (lo que Telegram muestra al tocar "/") vía `setMyCommands`. NO se deriva del webhook; re-ejecutar con `?secret=<CRON_SECRET>` cada vez que cambia la lista de comandos

### API Routes — Cron
Autorización vía `isCronAuthorized()` en `src/lib/cron-auth.ts`: acepta el secret por `?secret=` (pg_cron + pg_net) o `Authorization: Bearer`, compara con `process.env.CRON_SECRET` con `timingSafeEqual`, fail-closed si la env no está seteada. (pg_cron lo lee de la DB vía `clara_cron_secret()` — ver Config.)
- `/api/fires/sync` — manual FIRMS sync (IP residencial)
- `/api/alerts` — FIRMS → Telegram, con confirmation upgrade si matchea preliminary GOES (<5km, <2h). Aplica el filtro forestal (ver Key Patterns).
- `/api/goes-sync` — **Python** (`api/goes-sync.py`), descarga GOES-19 ABI-L2-FDCF, filtros, inserta en goes_preliminary, guarda stats en goes_sync_runs
- `/api/goes-alerts` — preliminary → Telegram + tracking en goes_alerted. Mismo filtro forestal que `/api/alerts`.
- `/api/goes-dismissals` — falsa alarma + DELETE preliminary descartadas + huérfanos
- `/api/lightning-alerts` — tormenta seca. Usa **rayos reales del GLM** (`lightning_flashes`, 30 km) cuando el latido `_clara_config.glm_last_sync_at` tiene menos de 15 min; si no, el método viejo por código de clima (OpenWeather / Open-Meteo). La respuesta dice `source: "glm" | "weather-code"`
- `/api/metar-sync` — viento medido del aeropuerto Comandante Espora (METAR SAZB, aviationweather.gov) → `wind_observations`. Sin la tabla responde 200 con `skipped: "table_missing"`
- `/api/glm-sync` — **Python** (`api/glm-sync.py`): archivos GLM de los últimos 6 min, flashes de buena calidad sobre Argentina → `lightning_flashes`, más el latido `glm_last_sync_at` (sin latido, "no hay rayos" no se distingue de "el sync murió")
- `/api/smn-wrf-sync` — **Python** (`api/smn-wrf-sync.py`): SMN WRF 4 km, la corrida completa más nueva, horas 0–18, celdas a <30 km de Bahía → `wind_forecast`. Escribe archivo por archivo y no arranca descargas después de 240 s. El SMN arranca una corrida cada 6 h (00, 06, 12 y 18 UTC), la publica ~2,5 h después y algunas no aparecen nunca: cron recomendado 02:45, 08:45, 14:45 y 20:45 UTC
- ⚠️ **WHI-907: las tablas de estas tres rutas NO están aplicadas (checkpoint C2) y sus crons NO están programados (checkpoint C5).** Hasta entonces responden `table_missing` y todo cae en los caminos viejos
- `/api/satellites/sync-tles` — baja TLEs de CelesTrak para Suomi NPP/NOAA-20/NOAA-21 (WHI-753)
- `/api/fire-danger-sync` — **Python** (`api/fire-danger-sync.py`), diario 09:00 UTC (06:00 ART). Por cada zona TDF: lee estado llevado `(ffmc,dmc,dc)` (spin-up ~30 días históricos si ausente), fetcha forecast 16 días Open-Meteo, encadena FWI ecuaciones Van Wagner, clasifica `bajo→moderado→alto→muy alto→extremo`, persiste en `fire_danger` y `fire_danger_state`
- `/api/monitor/fires-freshness` — monitor dual: staleness de `fires_cache` (>60 min) + flag `firms_sync_error` (key FIRMS inválida, escrito por el guard SQL). Alerta Telegram one-shot al `admin_chat_id`; la alerta de key suprime la genérica de staleness

### API Routes — Públicas (sat data)
- `/api/satellites/tles` — read-only, devuelve los TLEs almacenados. Cache CDN 1h + SWR 5min. Lo consume `<CitySatelliteCoverage>` para computar cobertura sin requerir cómputo server-side por las 78 páginas SSG.

## Data Sources (all free)
- **NASA FIRMS VIIRS**: focos confirmados, ~15 min, 375m res
- **NOAA GOES-19 ABI-L2-FDCF**: focos preliminares, 10 min, 2km res, vía AWS Open Data anonymous (`s3://noaa-goes19`)
- **NOAA GOES-19 GLM** (`s3://noaa-goes19/GLM-L2-LCFA`): rayos reales, un archivo cada 20 s. Ubica con margen de 8–14 km y no distingue nube-tierra de nube-nube
- **OpenWeather One Call 3.0 / Open-Meteo**: código de clima "tormenta". **No es detección de rayos**: sólo queda como fallback cuando GLM no está vivo
- **SMN WRF 4 km** (`s3://smn-ar-wrf`, licencia CC BY 2.5 AR — **requiere atribución**): viento, temperatura y humedad horarios alrededor de Bahía. No trae ráfagas
- **METAR SAZB** (aviationweather.gov): viento medido cada hora en el aeropuerto de Bahía Blanca. Es un solo punto, al este de la ciudad
- **Xweather** (opcional, plan Developer): `src/lib/xweather.ts`, inerte sin credenciales y **todavía no conectado a las alertas** (falta crear la cuenta y verificar cuántos accesos gasta una consulta de rayos)
- **Open-Meteo Forecast**: viento/temp/humedad. Toda URL de Open-Meteo pasa por `openMeteoUrl()` (`src/lib/open-meteo.ts`; par Python en `fire_danger/openmeteo.py`): con `OPEN_METEO_API_KEY` usa el host pago `customer-*`, sin ella el gratis. Un guardián falla si aparece una URL de Open-Meteo escrita a mano. **El plan gratis prohíbe el uso comercial** (WHI-905)
- **Open-Meteo Air Quality**: CAMS/Sentinel-5P
- **Open-Meteo Geocoding**: ciudad → lat/lng

## Supabase Tables (shared project)

### Suscripción + estado del bot
- `subscribers` (chat_id bigint PK, lat, lng, city_name, lightning_enabled bool default true, role text default 'civilian', cuartel_name text, created_at) — `role` y `cuartel_name` quedaron sin uso desde el retiro de bomberos (2026-09-14); se borran con OK explícito
- `fireman_codes` (code text PK, cuartel_name, used_count, max_uses) — **sin uso desde 2026-09-14** (WHI-907); pendiente de borrar con OK explícito
- `bot_commands_log` (id bigserial PK, chat_id, command, args, created_at) — WHI-587: engagement

### FIRMS (cache + dedup)
- `ai_alerted_fires` (fire_key text, chat_id bigint, alerted_at) — PK: (fire_key, chat_id)
- `fires_cache` (id int PK=1, fires jsonb, count, fetched_at) — single-row cache
- `_fires_sync_state` (id int PK=1, request_id, requested_at)
- `fires_daily_history` (date PK, count, avg_frp, high_conf, created_at)

### GOES (Fase 2)
- `goes_preliminary` (id bigserial PK, lat, lng, mask, mask_label, frp_mw, area_m2, high_confidence bool, seen_in_scans int default 1, agricultural_zone bool, scan_start timestamptz, detected_at) — UNIQUE (lat, lng, scan_start)
- `goes_alerted` (id bigserial PK, goes_id FK→goes_preliminary ON DELETE CASCADE, chat_id, preliminary_sent_at, confirmed_sent_at, dismissed_at, firms_fire_key) — UNIQUE (goes_id, chat_id)
- `goes_sync_runs` (id bigserial PK, scan_start, s3_key, fire_pixels_global, after_mask, after_polygon, after_urban, after_flaring, agricultural_count, after_dedup, inserted, persistent, download/process/total_seconds, created_at) — funnel + timing por scan

### Satélites (Fase 4 — WHI-752/753)
- `satellite_tles` (norad_id int PK, name, line1, line2, fetched_at) — Two-Line Elements de CelesTrak para Suomi NPP (37849), NOAA-20 (43013), NOAA-21 (54234). Refresh diario vía pg_cron. Si fetched_at > 7 días, la lib descarta el TLE (propagación con datos viejos da resultados sin sentido).

### Prevención (FWI)
- `danger_zones` (id text PK, province, name, lat, lng, bbox double precision[], geometry jsonb nullable) — definición de zonas de peligro
- `fire_danger_state` (zone_id, date, ffmc, dmc, dc; PK (zone_id, date)) — estado de humedad llevado día a día para encadenar el FWI
- `fire_danger` (id, zone_id, computed_at `date` (una corrida diaria — es date, no timestamp), target_date, fwi, danger_class, isi, bui, temp, rh, wind, precip; UNIQUE (zone_id, computed_at, target_date)) — forecast de peligro legible por zona

### Lightning
- `lightning_alerted` (id bigserial PK, chat_id, alerted_at) — rate-limit 30 min/sub

### Viento y rayos (WHI-907) — ⚠️ SQL escrito, NO aplicado (checkpoint C2)
Archivos: `scripts/sql/whi-907-wind.sql` y `scripts/sql/whi-907-lightning.sql`. RLS activo, sin policies y `REVOKE ALL` para anon/authenticated (RLS no gobierna TRUNCATE).
- `wind_observations` (station, observed_at, wind_from_deg nullable = VRB, wind_kmh, gust_kmh, variable; PK (station, observed_at)) — METAR, retención 90 días
- `wind_forecast` (source, run_at, valid_at, lat, lng, wind_from_deg, wind_kmh, temp_c, rh_pct; PK (source, run_at, valid_at, lat, lng)) — SMN WRF, retención 3 días. `fetchWind()` la prefiere a <30 km de Bahía (fila de la hora válida más cercana, después la celda más cercana, después la corrida más nueva)
- `lightning_flashes` (flash_at, lat, lng, energy_j, area_m2, source; PK (flash_at, lat, lng)) — GLM, retención 7 días
- Funciones de retención `purge_old_wind_data()` y `purge_old_lightning_flashes()` (SECURITY DEFINER, borran filas viejas; se agendan en C5)

### Config
- `_clara_config` (key PK, value text, updated_at) — `cron_secret`, `firms_map_key`, `admin_chat_id`, flags operativos (`fires_freshness_alerted_at`, `firms_sync_error`, `firms_key_alerted_at`) y `glm_last_sync_at` (latido del sync GLM, WHI-907). Cron jobs leen el secret via `clara_cron_secret()` SECURITY DEFINER

## Supabase pg_cron Jobs
- `fires-fetch` (`0,15,30,45 * * * *`) — pg_net GET a FIRMS, stores request_id
- `fires-process` (`2,17,32,47 * * * *`) — parsea CSV, REEMPLAZA fires_cache
- `fires-alerts` (`4,19,34,49 * * * *`) — `/api/alerts` (FIRMS + confirmation upgrades)
- `fires-daily-snapshot` (`55 23 * * *` = 20:55 ART) — snapshot diario. DEBE correr al final del día UTC (no ART): FIRMS sirve solo "current UTC day" y `fires_cache` se reemplaza en cada fetch, así que el horario UTC tardío es lo único que garantiza ~24h del día UTC acumuladas. Correrlo temprano en UTC produce snapshots en 0 (cache casi vacío)
- `goes-sync` (`5,15,25,35,45,55 * * * *`) — `/api/goes-sync` Python pipeline
- `goes-alerts` (`7,17,27,37,47,57 * * * *`) — `/api/goes-alerts` preliminary → Telegram
- `goes-dismissals` (`37 * * * *` hourly) — falsa alarma + DELETE preliminary descartadas + huérfanos
- `goes-prune` (`30 3 * * *` daily) — cleanup defensivo >7 días
- `satellites-sync-tles` (`30 4 * * *` daily, 01:30 ART) — `/api/satellites/sync-tles` baja TLEs frescos de CelesTrak (WHI-753)
- `fire-danger-sync` (`0 9 * * *` daily, 06:00 ART) — `/api/fire-danger-sync` Python: FWI por zona TDF, 16-day forecast. Usa `trigger_fire_danger_sync()` + GUC `app.fire_danger_sync_url` + `clara_cron_secret()`. SQL en `scripts/sql/whi-fwi-cron.sql`
- `fires-freshness-monitor` (`7,22,37,52 * * * *`) — `/api/monitor/fires-freshness` staleness + key inválida.
  ⚠️ Corrido a `:07` el 2026-08-26: antes era `*/15`, o sea que revisaba en el
  MISMO minuto que `fires-fetch` (`0,15,30,45`) y 2 minutos ANTES de que
  `fires-process` (`2,17,32,47`) escribiera el caché — siempre miraba el ciclo
  anterior. Ahora mira después de que el dato llegó. **Esto NO fue la causa de
  las falsas alarmas del 26/8** (ver más abajo), es ordenamiento.

## Supabase Functions / RPC
- `fires_sync_step1_fetch()` — HTTP GET a FIRMS via pg_net
- `fires_sync_step2_process()` — parsea CSV, REEMPLAZA fires_cache (WHI-378 fix) + guard de body no-CSV (aplicado 2026-07-21, ver Key Patterns). ⚠️ La función real de prod es RETURNS void — el archivo canónico sincronizado con prod es `scripts/sql/whi-firms-body-guard.sql`; inspeccionar prod antes de tocarla
- `clara_cron_secret()` SECURITY DEFINER — devuelve CRON_SECRET desde `_clara_config`, usado por pg_cron jobs así no queda literal en cron.job.command
- `clara_cron_health()` SECURITY DEFINER — lectura de cron.job_run_details para el dashboard /health

## Key Patterns
- FIRMS bloquea datacenter IPs pero NO Supabase (AWS us-east-1)
- pg_cron + pg_net fetcha FIRMS desde Postgres
- **GOES**: Python Vercel Function lee NetCDF de S3 (noaa-goes19 anonymous), procesa con xarray + pyproj, upsert a Supabase via PostgREST
- **Auth**: Supabase Auth con `@supabase/ssr`, middleware en `src/middleware.ts` gating de `/dashboard/*` con allowlist de emails
- Supabase client lazy init (getSupabase()) — NUNCA module scope (Vercel build evalúa rutas)
- AI summaries: Groq primary → template fallback
- Wind direction: `degreesToCardinal()` + `cardinalToSpanish()` en `src/lib/wind.ts`
- **Convención de viento**: la dirección es desde dónde VIENE el viento (Open-Meteo, METAR y SMN coinciden; verificado contra SAZB). El único helper para "¿el humo va hacia el vecino?" es `smokeHeadsTowardUser()` en `src/lib/geo.ts`. **Hasta el 14/9/2026 la comparación estaba invertida** y la alerta decía "hacia tu posición" cuando el humo se alejaba (WHI-908)
- **Regla CSIRO del 20%** (`src/lib/fire-spread.ts`): el frente de un pastizal avanza al 20% del viento, sólo con viento >30 km/h y humedad del pasto muerto <6%. Fuera de esas condiciones devuelve null: nunca un número inventado. La alerta agrega la línea "Si el viento se mantiene, el fuego podría llegar en…" sólo cuando aplica
- **Cono en el mapa** (`src/lib/fire-projection.ts` + `src/lib/projection-legend.ts`): humo y frente son capas separadas, cada línea del frente lleva su hora escrita, y la leyenda dice "Es una estimación, no un límite…". Viento <10 km/h dibuja sólo un círculo "viento variable"; un foco sin confirmar sólo humo, como "posible foco"
- WHO AQI thresholds en `src/lib/air-quality.ts` — worst pollutant wins
- City pages SSG via `generateStaticParams()` desde `argentina-cities.ts` (~78)
- Dispersión: Gaussian plume (Pasquill-Gifford) en `src/lib/dispersion.ts`
- Fire history backfill: `scripts/backfill-fires.sh` con MAP_KEY desde `scripts/backfill.env` (gitignored)
- Leaflet maps con dynamic import + ssr:false
- **Filtro forestal (canónico)**: todo suscriptor recibe sólo alertas de focos en zona forestal, con interpretación AI. Aplica en `/api/alerts` y `/api/goes-alerts`. (Hasta el 2026-09-14 existía un rol de bombero que recibía todo con formato operativo; se retiró sin haberse usado nunca — WHI-907.) El mismo filtro gobierna landing/mapa/`/ciudad` (ver Forest classification > Aplicado en), **excepto `/bahia-blanca`**, que muestra todos los focos de vegetación (`showsFire(f, "vegetation")` en `src/lib/city-fires.ts`).
  - 🔴 **Bahía Blanca no está en ninguna de las 7 zonas forestales** (son sólo bosques). Como las dos alertas del bot aplican el filtro, **hoy un incendio de pastizal cerca de Bahía no genera alerta**. Cambiarlo es decisión de producto (volumen, quemas agrícolas, antorchas de Ingeniero White) y quedó pendiente con Seba.
- Doble confirmación: preliminary GOES → confirmation upgrade FIRMS si <5km/<2h → dismissal automático tras 4h
- Preliminaries descartadas se BORRAN de goes_preliminary (cascade goes_alerted) — el landing metric "Preliminares activos" refleja solo lo pendiente
- **Guard de body FIRMS**: NASA devuelve errores ("Invalid MAP_KEY.") con HTTP 200; `fires_sync_step2_process()` solo escribe `fires_cache` si el body empieza con el header CSV `latitude,...` — si no, marca `_clara_config.firms_sync_error` y el monitor alerta. Rotación semi-automática con el comando oculto de admin `/rotarkey <key>` (valida en vivo contra NASA antes de guardar; NO va en sync-commands)

## Forest classification (Fase 4 — WHI-756 a WHI-761)

**Pivote conceptual del producto**: CLARA pasó de "monitor de detecciones térmicas con filtros de exclusión" a "monitor de focos en zona forestal con opcional ver todo". El landing, mapa, /ciudad y bot Telegram aplican el mismo filtro.

### Datos
- **Fuente**: MapBiomas Argentina Colección 2 (2024), clase 3 "Formación Forestal". 7 polígonos pre-procesados a JSON:
  - `andino-patagonico`, `yungas`, `selva-misionera`, `espinal-mesopotamico`, `sierras-cordoba`, `chaco-norte`, `tierra-del-fuego` en `src/lib/forest-polygons/*.json`
- **Pipeline reproducible** (en local, no en CI):
  - Download `argentina_coverage_2024.tif` de `storage.googleapis.com/mapbiomas-public/initiatives/argentina/collection-2/coverage/`
  - Por zona: `gdal_translate -projwin` → `gdal_calc "A==3"` → `gdalwarp -tr 0.005` (downsample a ~500m) → `gdal_polygonize` → `mapshaper -filter-islands min-area=20km2 -dissolve -simplify dp 2% keep-shapes -clean` → precision 3 decimales
  - **Total: ~205 KB** combinados, server-only.

### Arquitectura del lib
- `src/lib/forest-zones.ts` — **client-safe**, metadata only (id + name + `forestZoneName()`). 37 líneas.
- `src/lib/forest-zones-geo.ts` — **server-only** (`import "server-only"`). Carga los 7 JSON polígonos + expone `findForestZone()` con buffer WUI 5km y fast-reject por bbox pre-computado.
- IDs de zona estables — los tags `forestZone` en `fires_cache` no necesitan migración entre versiones.

### Buffer WUI 5km
- `findForestZone()` devuelve la zona si el punto cae adentro **o si está a <5km del borde** (`FOREST_BUFFER_KM`).
- Captura el wildland-urban interface (Bariloche, Villa Carlos Paz, El Bolsón) donde los incendios forestales son más peligrosos para personas.
- Fast path (point-in-polygon con bbox filter) → slow path (cross-track distance al ring) solo si el primer no matchea.

### Aplicado en
- **Hero**: `forestTotal = high + moderate + low` (todos los wildfires en forestZone). Sub-line muestra "+N fuera de zona forestal".
- **Mapa `/`**: capa Focos forestales filtra `f.forestZone` truthy. Toggle "+ No forestal" muestra los grises translúcidos (no-forestal con opacidad baja para no competir visualmente).
- **`/ciudad/[p]/[c]`**: bloque `<CityForestFires>` muestra los 3 focos forestales más cercanos en 100km. Si 0, mensaje positivo "Sin actividad forestal en 100 km" (tono `--good`).
- **Bot Telegram**: `/api/alerts` y `/api/goes-alerts` filtran por zona forestal (ver Key Patterns > Filtro forestal). Mensaje incluye línea "🌲 Zona: {nombre}". Si el foco está a <100 km de Bahía Blanca, la alerta agrega "🗺️ Ver hacia dónde va" con el link a `/bahia-blanca?foco=`, antes del de Google Maps.

## Satellite trajectories (WHI-752 a WHI-755)

**Visualización de cobertura satelital VIIRS sobre Argentina**. Datos de NORAD/CelesTrak, propagación SGP4 client-side con `satellite.js@5`.

⚠️ **CRÍTICO: usar `satellite.js@5`, no @6 o @7**. Las versiones 6+ importan `node:worker_threads` y `node:module` en builds WASM internas, que rompen el bundle del browser. Webpack falla con `UnhandledSchemeError`, Turbopack se cuelga silenciosamente en "Creating optimized production build". v5 es la última versión 100% JS pura con la misma API pública.

### Lib
- `src/lib/satellites.ts` — client-safe: `computeNextPassOverArgentina`, `computeGroundTrack` (con split por antimeridiano), `currentSubSatellitePoint`, `findLastVIIRSCoverage`, `findNextVIIRSCoverage`, `formatCountdown`, `formatTimeAgo`. Tipo `SatelliteTLE`.
- `src/lib/satellites-server.ts` — `fetchTLEs()` (lee `satellite_tles` con SERVICE_ROLE). Server-only.

### Renderizado
- **Hero** (`src/app/(main)/page.tsx`): badge "🛰 Pase VIIRS en Xh Ymin" en pill row. Mini-mapa (`fire-map.tsx`) muestra ground tracks 90 min + emoji 🛰 en posición actual (sin marker animado, render una sola vez).
- **`/mapa`** (`argentina-map.tsx`): capa "Satélites" activa por default. Ground tracks 3h con polylines punteadas. Marker emoji 🛰 con tooltip (NORAD + link n2yo). Reposiciona cada 5s vía `setLatLng()` sin re-trazar la polyline. Toggle on/off + sub-chips por satélite.
- **`/ciudad/[p]/[c]`** (`<CitySatelliteCoverage>`): card con "Última pasada VIIRS hace Xh" + "Próxima pasada en Yh". Fetch a `/api/satellites/tles` (1h CDN cache), re-computa cada 5min client-side. Para evitar React 19 purity rule, guarda `computedAt` con el state.

## Prevención (FWI)

**Pivote B2B (Milestone 1 — feat/prevention-fwi)**: índice de peligro de incendio *antes* de que aparezca un foco. FWI canadiense (Van Wagner & Pickett 1985), implementado nativamente (stdlib math, sin dependencia externa), corrección hemisferio sur aplicada. Datos: Open-Meteo forecast 16 días + `fire_danger_state` como estado llevado con spin-up de ~30 días históricos si la zona no tiene estado previo.

- Spec: `docs/superpowers/specs/2026-06-17-prevencion-fwi-design.md`
- Plan: `docs/superpowers/plans/2026-06-18-fwi-engine.md`
- Esquema SQL: `scripts/sql/whi-fwi-schema.sql` + `scripts/sql/whi-fwi-cron.sql`
- Zonas implementadas: `tdf-norte-estepa` + `tdf-sur-bosque` (Tierra del Fuego). Más provincias en fases posteriores.
- Clases de peligro: `bajo → moderado → alto → muy alto → extremo`. Umbrales provisorios — calibración pendiente.
- Página pública por provincia y bot Telegram: milestones posteriores (no en Milestone 1).

## SEO
- Title template: "%s — AlertaForestal" (default: "AlertaForestal — Alertas de incendios forestales en Argentina")
- robots.ts: allow all excepto /api/, /dashboard, /login
- sitemap.ts: estáticas + `/bahia-blanca` + 77 ciudades (la genérica de Bahía no, porque redirige) + /como-funciona = ~85 URLs
- JSON-LD: WebApplication en root layout, Place + GeoCoordinates por ciudad
- OG image dinámica via `next/og` ImageResponse en `src/app/opengraph-image.tsx` (1200×630)
- OpenGraph + Twitter cards en todas las páginas

## Seguridad (WHI-586 auditado)
- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy en `next.config.ts`
- RLS habilitado en todas las tablas, anon/auth roles bloqueados — service_role bypassea
- Migrado al nuevo sistema de API keys de Supabase: `sb_publishable_*` (anon) + `sb_secret_*` (service role). Legacy JWT system disabled.
- CRON_SECRET nunca literal en cron jobs (ver Config + API Routes — Cron para el doble path)
- Secrets fuera del repo (.env*, scripts/*.env gitignored). Templates en *.env.example
- Variables opcionales de WHI-907 (siempre con `.trim()`): `OPEN_METEO_API_KEY` (activa el plan pago), `XWEATHER_CLIENT_ID` + `XWEATHER_CLIENT_SECRET`, `XWEATHER_MONTHLY_ACCESSES` y `XWEATHER_ACCESSES_PER_LIGHTNING_QUERY` (cupo; por defecto 15000 y 10, con 10% de reserva). Sin ellas todo funciona como antes
- Procedimiento de rotación documentado en `SECURITY-AUDIT.md`

## Current focus
- El producto está construido (detección dual GOES/FIRMS, pivote forestal, trayectorias satelitales, bot Telegram, dashboard) pero tiene casi 0 usuarios. Foco actual (sept. 2026): **Bahía Blanca nivel 1** (WHI-907) antes de la temporada de incendios (nov–abr), y el producto institucional para municipios. La vía de cuarteles de bomberos se retiró el 14/9 sin haberse usado.
- Estado de fases, tickets y pendientes (dominio propio, WhatsApp, SMS) viven en Linear (CLARA project) + git history — no en este archivo.

## Docs en el repo
- `README.md` — overview para humanos + bot commands + APIs
- `TESTING.md` — recipes de verificación end-to-end (incluye inyección de focos sintéticos)
- `SECURITY-AUDIT.md` — findings + procedimiento de rotación de secrets
- `scripts/goes-spike/REPORT.md` — viabilidad pipeline GOES (referencia histórica)
- `scripts/glm-spike/REPORT.md` — GLM evaluation (histórico: se implementó en WHI-907)
- `docs/superpowers/plans/2026-09-14-bahia-blanca-nivel-1.md` — plan de WHI-907/WHI-908, con los formatos reales de SMN, GLM y FDCM anotados
- `scripts/super-res-research/REPORT.md` — super-resolución (rejected)
- `scripts/WHI-581-bot-rotation.md` — procedimiento rotación bot
