@AGENTS.md

# AlertaIncendios

Bot de Telegram que alerta sobre focos de calor en Argentina usando NASA FIRMS.

## Stack
- Next.js 16 + TypeScript
- Tailwind CSS v4 + Motion (animations)
- Phosphor Icons
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs)
- Vercel (deploy)

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios
- Linear: AlertaIncendios — Bot de Alertas de Incendios Forestales (Whitebay team)
- Deploy: Vercel (https://alertaincendios.vercel.app)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @AlertaIncendiosArgBot

## Architecture
- Landing: `/` — thermal operations console with FIRMS map + animated fire count
- API routes:
  - `/api/fires` — reads fire data from Supabase fires_cache
  - `/api/fires/sync?secret=...` — fetches FIRMS data and writes to Supabase (must be called from residential IP)
  - `/api/alerts?secret=...` — cron endpoint, evalúa focos vs suscriptores, envía alertas
  - `/api/bot/telegram` — Telegram webhook (commands: /start, /ciudad, /estado, /cancelar)

## Data Sources (all free)
- NASA FIRMS VIIRS: active fire hotspots (near real-time)
- Open-Meteo: wind speed/direction at fire location
- Open-Meteo Geocoding: city name → lat/lng

## Supabase Tables (shared project, separate tables)
- `subscribers` (chat_id bigint PK, lat float, lng float, city_name text, created_at timestamptz)
- `ai_alerted_fires` (fire_key text, chat_id bigint, alerted_at timestamptz) — PK: (fire_key, chat_id)
- `fires_cache` (id int PK=1, fires jsonb, count int, fetched_at timestamptz) — single-row cache

## Key Patterns
- FIRMS blocks datacenter IPs (Vercel, AWS) — fire data is cached in Supabase via /api/fires/sync
- Sync must be called from residential IP every 15min (local cron or external service)
- Supabase client uses lazy init (getSupabase()) — NOT module scope
- Geo utilities in src/lib/geo.ts (haversine, isUpwind, smokeEta)
- Bot accepts GPS location OR /ciudad <name> (geocoded via Open-Meteo)
- Alert dedup: fire_key = lat_lng_date, checked per subscriber
- Dispersion model: haversine distance + wind direction → isUpwind + ETA

## Proyecto Whitebay
Este proyecto es parte del ecosistema Whitebay.
