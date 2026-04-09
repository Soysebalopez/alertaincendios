@AGENTS.md

# AlertaIncendios

Bot de Telegram que alerta sobre focos de calor en Argentina usando NASA FIRMS.

## Stack
- Next.js 16 + TypeScript
- Tailwind CSS v4 + Motion (animations)
- Phosphor Icons + Leaflet (map)
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs)
- Vercel (deploy)
- Groq (AI interpretation in bot)

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios
- Linear: AlertaIncendios — Bot de Alertas de Incendios Forestales (Whitebay team)
- Deploy: Vercel (https://alertaincendios.vercel.app)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @AlertaIncendiosBot

## Architecture
- Landing: `/` — thermal operations console with Leaflet map + animated fire count
- API routes:
  - `/api/fires` — reads fire data from Supabase fires_cache
  - `/api/fires/sync?secret=...` — fetches FIRMS data and writes to Supabase (backup, needs residential IP)
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
- `_fires_sync_state` (id int PK=1, request_id bigint, requested_at timestamptz) — internal sync state

## Supabase pg_cron Jobs (fully automated, no external dependency)
- `fires-fetch` (*/15 at :00,:15,:30,:45) — pg_net GET to FIRMS, stores request_id
- `fires-process` (*/15 at :02,:17,:32,:47) — parses CSV response, updates fires_cache
- `fires-alerts` (*/15 at :04,:19,:34,:49) — calls /api/alerts on Vercel to evaluate + send Telegram alerts

## Supabase Functions
- `fires_sync_step1_fetch()` — makes HTTP GET to FIRMS via pg_net
- `fires_sync_step2_process()` — parses CSV response and updates fires_cache

## Key Patterns
- FIRMS blocks datacenter IPs (Vercel, AWS) but NOT Supabase (AWS us-east-1)
- pg_cron + pg_net fetches FIRMS data every 15 min entirely from Postgres — no external cron needed
- Vercel cron /api/alerts every 6h as fallback
- Supabase client uses lazy init (getSupabase()) — NOT module scope
- Geo utilities in src/lib/geo.ts (haversine, isUpwind, smokeEta)
- Bot accepts GPS location OR /ciudad <name> (geocoded via Open-Meteo)
- Alert dedup: fire_key = lat_lng_date, checked per subscriber
- Dispersion model: haversine distance + wind direction → isUpwind + ETA
- Groq llama-3.3-70b-versatile for AI interpretation in /estado command

## Proyecto Whitebay
Este proyecto es parte del ecosistema Whitebay.
