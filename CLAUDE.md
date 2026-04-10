@AGENTS.md

# CLARA (AlertaIncendios)

Central de Localizacion y Alerta de Riesgo Ambiental — plataforma de monitoreo ambiental ciudadano para Argentina.

## Stack
- Next.js 16 + TypeScript
- Tailwind CSS v4 + Motion (animations)
- Phosphor Icons + Leaflet (maps) + Recharts (charts)
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs)
- Vercel (deploy)
- Groq llama-3.3-70b (AI citizen summaries)

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios
- Linear: AlertaIncendios — Bot de Alertas de Incendios Forestales (Whitebay team)
- Deploy: Vercel (https://alertaincendios.vercel.app)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @AlertaIncendiosBot

## Design System
- Font: Outfit (headings + body) + Geist Mono (data/labels)
- Palette: near-black (#0a0a08), warm beige foreground (#d4d4cc), burnt orange accent (#e8622c)
- Surfaces: #131311, #1a1a17 — borders: #252520 — muted: #8a8a7e
- Coordinate grid overlay (60px, accent tint)
- Ember particles (CSS, float up), scanline effect
- Nav text uses color-mix(in oklab, foreground 80%, transparent)

## Architecture

### Pages
- Landing: `/` — split-screen hero (fire count + Leaflet map), live city slider (10 random cities, auto-rotate 8s), "Como funciona", CTAs
- Mapa: `/mapa` — fullscreen Leaflet with layers: focos (FIRMS), calidad del aire (all cities), viento (arrows). Own layout (no footer)
- Calidad del aire: `/calidad-aire` — province selector → city cards with wind + AI citizen summary
- Ciudad: `/ciudad/[province]/[city]` — SSG 78 pages. Dashboard: semaphore + AI summary + wind card + pollutant grid + Leaflet map (zoom 13, collapsible data panel) + air quality evolution (Recharts, 3/7/14/30 days)
- Historial: `/historial` — fire history chart (Recharts), period selector (1m/6m, longer disabled until more data). Supabase fires_daily_history table.
- Sobre: not yet

### Route Groups
- `(main)` — Nav + Footer + EmberParticles (landing, historial, calidad-aire, ciudad pages)
- `/mapa` — Nav + EmberParticles, no footer (fullscreen map)

### API Routes
- `/api/fires` — reads fire data from Supabase fires_cache
- `/api/fires/history?months=N` — daily fire counts from fires_daily_history
- `/api/fires/sync?secret=...` — manual FIRMS sync (needs residential IP)
- `/api/air-quality?lat=X&lng=Y` — Open-Meteo CAMS (NO2, SO2, O3, CO, PM25, PM10) with WHO levels
- `/api/wind?lat=X&lng=Y` — Open-Meteo wind (speed, direction in Spanish, temp, humidity)
- `/api/summary?lat=X&lng=Y&city=Name` — Groq AI citizen summary (fallback: template)
- `/api/history?lat=X&lng=Y&pollutant=NO2&days=7` — historical air quality (hourly→daily avg)
- `/api/simulate` — POST, Gaussian plume dispersion model (Pasquill-Gifford)
- `/api/alerts?secret=...` — cron: evaluate fires vs subscribers, send Telegram alerts
- `/api/bot/telegram` — Telegram webhook (commands: /start, /ciudad, /estado, /cancelar)

## Data Sources (all free)
- NASA FIRMS VIIRS: active fire hotspots (near real-time, 375m resolution)
- Open-Meteo Forecast: wind speed/direction/gusts/temp/humidity
- Open-Meteo Air Quality: CAMS/Sentinel-5P derived pollutants
- Open-Meteo Geocoding: city name → lat/lng

## Supabase Tables (shared project)
- `subscribers` (chat_id bigint PK, lat float, lng float, city_name text, created_at timestamptz)
- `ai_alerted_fires` (fire_key text, chat_id bigint, alerted_at timestamptz) — PK: (fire_key, chat_id)
- `fires_cache` (id int PK=1, fires jsonb, count int, fetched_at timestamptz) — single-row cache
- `_fires_sync_state` (id int PK=1, request_id bigint, requested_at timestamptz) — internal sync state
- `fires_daily_history` (date date PK, count int, avg_frp real, high_conf int, created_at timestamptz) — daily aggregates for charts

## Supabase pg_cron Jobs
- `fires-fetch` (*/15 at :00,:15,:30,:45) — pg_net GET to FIRMS, stores request_id
- `fires-process` (*/15 at :02,:17,:32,:47) — parses CSV response, updates fires_cache
- `fires-alerts` (*/15 at :04,:19,:34,:49) — calls /api/alerts on Vercel
- `fires-daily-snapshot` (daily 23:55 ART / 02:55 UTC) — upserts today's count into fires_daily_history

## Supabase Functions
- `fires_sync_step1_fetch()` — HTTP GET to FIRMS via pg_net
- `fires_sync_step2_process()` — parses CSV, updates fires_cache (REPLACES, does not concatenate)

## Key Patterns
- FIRMS blocks datacenter IPs but NOT Supabase (AWS us-east-1)
- pg_cron + pg_net fetches FIRMS every 15 min entirely from Postgres
- Supabase client uses lazy init (getSupabase()) — NOT module scope (Vercel evaluates routes at build time)
- AI citizen summaries: Groq primary → template fallback. Prompt: "Traduci a 2-3 oraciones sin jerga cientifica. Usa semaforo: BUENO/MODERADO/MALO/PELIGROSO."
- Wind direction: degreesToCardinal() + cardinalToSpanish() in src/lib/wind.ts
- WHO AQI thresholds in src/lib/air-quality.ts — worst pollutant wins overall level
- City pages SSG via generateStaticParams() from argentina-cities.ts (~78 cities)
- Dispersion model: Gaussian plume (Pasquill-Gifford) in src/lib/dispersion.ts — generalized for any location
- Fire history backfill: scripts/backfill-fires.sh (run locally, FIRMS blocks datacenter IPs)
- Leaflet maps use dynamic import with ssr:false
- SEO: robots.ts, sitemap.ts (84 URLs), JSON-LD structured data, OG + Twitter cards

## SEO
- Title template: "%s — CLARA"
- robots.ts: allow all except /api/
- sitemap.ts: all static + 78 city pages
- JSON-LD: WebApplication on main layout, Place + GeoCoordinates on city pages
- OpenGraph + Twitter cards on all pages
- Missing: OG image (1200x630)

## Project Status
- Fase 1 — Alertas de incendios (Telegram bot): COMPLETE
- Fase 2 — Plataforma de monitoreo ambiental ciudadano: COMPLETE
  - Landing con slider de ciudades
  - Mapa nacional interactivo (focos + aire + viento)
  - Calidad del aire por provincia/ciudad (24 provincias, ~80 ciudades)
  - Páginas por ciudad con dashboard completo + AI summary
  - Historial de incendios (100 días backfilled, pg_cron diario)
  - SEO completo
- Pendiente: OG image, deploy a Vercel, más backfill de datos históricos

## Proyecto Whitebay
Este proyecto es parte del ecosistema Whitebay.
