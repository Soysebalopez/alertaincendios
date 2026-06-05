@AGENTS.md

# AlertaForestal

Alertas tempranas de incendios forestales en Argentina vía Telegram. El bot del servicio se llama **Clara** (antes el proyecto se llamaba C.L.A.R.A.; "Clara" quedó como persona del bot, y el sitio pasó a ser AlertaForestal.org). Detección dual: GOES-19 (10 min, preliminar) + NASA FIRMS (15 min, confirmado). Gratuito B2C, complementario a Satellites On Fire.

## Stack
- Next.js 16 + TypeScript + Tailwind CSS v4 + Motion + Phosphor Icons + Leaflet + Recharts
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs) — Postgres + pg_cron + pg_net + Auth
- Vercel Hobby — Next.js routes (TS) + 1 Python Vercel Function (`api/goes-sync.py`)
- Groq llama-3.3-70b (AI citizen summaries + interpretation)
- Python pipeline: xarray, netCDF4, boto3, pyproj — procesa GOES NetCDF en Vercel

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios (repo conserva el nombre viejo)
- Linear: CLARA project en Whitebay Products team
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
- Historial: `/historial` — Recharts evolución de focos
- Cómo funciona: `/como-funciona` — FAQ ciudadano (8 preguntas, sin jerga)
- Cuarteles: `/cuarteles` — landing para bomberos voluntarios (comparativa vecino/bombero, cómo activar el rol con código) + **form de alta de cuartel** que envía la solicitud por email vía Resend (`<CuartelRequestForm>` → `/api/cuarteles/request`). Opción A del onboarding fireman: contacto manual, sin auto-emisión de códigos todavía
- Dashboard: `/dashboard`, `/dashboard/alerts`, `/dashboard/health`, `/dashboard/superadmin` — métricas internas (`superadmin` agrega breakdown de subscribers, top cuarteles, funnel GOES, latencias, forest split), gated por Supabase Auth allowlist (soysebalopez@gmail.com)
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
- `/api/simulate` — POST, dispersión gaussiana (Pasquill-Gifford)
- `/api/cuarteles/request` — POST, recibe el form de alta de cuartel y manda email al owner vía **Resend** (lazy init, `from: onboarding@resend.dev`, reply-to al email del cuartel). Honeypot anti-spam + rate-limit 5/min/IP. Requiere `RESEND_API_KEY` en env (Production); sin la key devuelve `email_unavailable`
- `/api/bot/telegram` — webhook Telegram
- `/api/bot/sync-commands` — registra el menú nativo del bot (lo que Telegram muestra al tocar "/") vía `setMyCommands`. NO se deriva del webhook; re-ejecutar con `?secret=<CRON_SECRET>` cada vez que cambia la lista de comandos

### API Routes — Cron
Autorización vía `isCronAuthorized()` en `src/lib/cron-auth.ts`: acepta el secret por `?secret=` (pg_cron + pg_net) o `Authorization: Bearer`, compara con `process.env.CRON_SECRET` con `timingSafeEqual`, fail-closed si la env no está seteada. (pg_cron lo lee de la DB vía `clara_cron_secret()` — ver Config.)
- `/api/fires/sync` — manual FIRMS sync (IP residencial)
- `/api/alerts` — FIRMS → Telegram, con confirmation upgrade si matchea preliminary GOES (<5km, <2h). Aplica el filtro forestal (ver Key Patterns).
- `/api/goes-sync` — **Python** (`api/goes-sync.py`), descarga GOES-19 ABI-L2-FDCF, filtros, inserta en goes_preliminary, guarda stats en goes_sync_runs
- `/api/goes-alerts` — preliminary → Telegram + tracking en goes_alerted. Mismo filtro forestal que `/api/alerts`.
- `/api/goes-dismissals` — falsa alarma + DELETE preliminary descartadas + huérfanos
- `/api/lightning-alerts` — tormenta seca (OpenWeather + Open-Meteo fallback)
- `/api/satellites/sync-tles` — baja TLEs de CelesTrak para Suomi NPP/NOAA-20/NOAA-21 (WHI-753)

### API Routes — Públicas (sat data)
- `/api/satellites/tles` — read-only, devuelve los TLEs almacenados. Cache CDN 1h + SWR 5min. Lo consume `<CitySatelliteCoverage>` para computar cobertura sin requerir cómputo server-side por las 78 páginas SSG.

## Data Sources (all free)
- **NASA FIRMS VIIRS**: focos confirmados, ~15 min, 375m res
- **NOAA GOES-19 ABI-L2-FDCF**: focos preliminares, 10 min, 2km res, vía AWS Open Data anonymous (`s3://noaa-goes19`)
- **OpenWeather One Call 3.0**: rayos (con Open-Meteo Lightning fallback)
- **Open-Meteo Forecast**: viento/temp/humedad
- **Open-Meteo Air Quality**: CAMS/Sentinel-5P
- **Open-Meteo Geocoding**: ciudad → lat/lng

## Supabase Tables (shared project)

### Suscripción + estado del bot
- `subscribers` (chat_id bigint PK, lat, lng, city_name, lightning_enabled bool default true, role text default 'civilian', cuartel_name text, created_at)
- `fireman_codes` (code text PK, cuartel_name, used_count, max_uses) — WHI-588: invite codes
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

### Lightning
- `lightning_alerted` (id bigserial PK, chat_id, alerted_at) — rate-limit 30 min/sub

### Config
- `_clara_config` (key PK, value, updated_at) — actualmente solo `cron_secret`. Cron jobs leen via `clara_cron_secret()` SECURITY DEFINER

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

## Supabase Functions / RPC
- `fires_sync_step1_fetch()` — HTTP GET a FIRMS via pg_net
- `fires_sync_step2_process()` — parsea CSV, REEMPLAZA fires_cache (WHI-378 fix)
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
- WHO AQI thresholds en `src/lib/air-quality.ts` — worst pollutant wins
- City pages SSG via `generateStaticParams()` desde `argentina-cities.ts` (~78)
- Dispersión: Gaussian plume (Pasquill-Gifford) en `src/lib/dispersion.ts`
- Fire history backfill: `scripts/backfill-fires.sh` con MAP_KEY desde `scripts/backfill.env` (gitignored)
- Leaflet maps con dynamic import + ssr:false
- **Filtro forestal por rol (canónico)**: `subscribers.role` determina (a) qué focos llegan — civilian solo recibe alertas en zona forestal, fireman recibe todo — y (b) el tono del mensaje: civilian con AI interpretation, fireman operativo sin AI firmado por cuartel. Aplica en `/api/alerts` y `/api/goes-alerts`. El mismo filtro (sin rol) gobierna landing/mapa/`/ciudad` (ver Forest classification > Aplicado en).
- Doble confirmación: preliminary GOES → confirmation upgrade FIRMS si <5km/<2h → dismissal automático tras 4h
- Preliminaries descartadas se BORRAN de goes_preliminary (cascade goes_alerted) — el landing metric "Preliminares activos" refleja solo lo pendiente

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
- **Bot Telegram**: `/api/alerts` y `/api/goes-alerts` filtran por rol (ver Key Patterns > Filtro forestal). Mensaje incluye línea "🌲 Zona: {nombre}".

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

## SEO
- Title template: "%s — AlertaForestal" (default: "AlertaForestal — Alertas de incendios forestales en Argentina")
- robots.ts: allow all excepto /api/, /dashboard, /login
- sitemap.ts: estáticas + 78 ciudades + /como-funciona = ~85 URLs
- JSON-LD: WebApplication en root layout, Place + GeoCoordinates por ciudad
- OG image dinámica via `next/og` ImageResponse en `src/app/opengraph-image.tsx` (1200×630)
- OpenGraph + Twitter cards en todas las páginas

## Seguridad (WHI-586 auditado)
- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy en `next.config.ts`
- RLS habilitado en todas las tablas, anon/auth roles bloqueados — service_role bypassea
- Migrado al nuevo sistema de API keys de Supabase: `sb_publishable_*` (anon) + `sb_secret_*` (service role). Legacy JWT system disabled.
- CRON_SECRET nunca literal en cron jobs (ver Config + API Routes — Cron para el doble path)
- Secrets fuera del repo (.env*, scripts/*.env gitignored). Templates en *.env.example
- Procedimiento de rotación documentado en `SECURITY-AUDIT.md`

## Current focus
- El producto está construido (detección dual GOES/FIRMS, pivote forestal, trayectorias satelitales, bot Telegram, dashboard) pero tiene casi 0 usuarios. Foco actual: **go-to-market** vía cuarteles de bomberos voluntarios. Plan en `founders_meeting.md`.
- Estado de fases, tickets y pendientes (dominio propio, WhatsApp, SMS) viven en Linear (CLARA project) + git history — no en este archivo.

## Docs en el repo
- `README.md` — overview para humanos + bot commands + APIs
- `TESTING.md` — recipes de verificación end-to-end (incluye inyección de focos sintéticos)
- `SECURITY-AUDIT.md` — findings + procedimiento de rotación de secrets
- `scripts/goes-spike/REPORT.md` — viabilidad pipeline GOES (referencia histórica)
- `scripts/glm-spike/REPORT.md` — GLM evaluation (defer)
- `scripts/super-res-research/REPORT.md` — super-resolución (rejected)
- `scripts/WHI-581-bot-rotation.md` — procedimiento rotación bot
