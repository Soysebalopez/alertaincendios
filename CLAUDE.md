@AGENTS.md

# AlertaIncendios

Bot de Telegram que alerta sobre focos de calor en Argentina usando NASA FIRMS.

## Stack
- Next.js 16 + TypeScript
- Tailwind CSS v4
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs)
- Netlify (deploy + scheduled functions)

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios
- Linear: AlertaIncendios — Bot de Alertas de Incendios Forestales (Whitebay team)
- Deploy: Netlify (pending setup)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @AlertaIncendiosArgBot (pending BotFather setup)

## Architecture
- Landing: `/` — mapa de focos activos + CTA al bot
- API routes:
  - `/api/fires` — NASA FIRMS VIIRS para toda Argentina (cache 15min)
  - `/api/alerts?secret=...` — cron endpoint, evalúa focos vs suscriptores, envía alertas
  - `/api/bot/telegram` — Telegram webhook (commands: /start, /ciudad, /estado, /cancelar)

## Data Sources (all free)
- NASA FIRMS VIIRS: active fire hotspots (near real-time)
- Open-Meteo: wind speed/direction at fire location
- Open-Meteo Geocoding: city name → lat/lng

## Supabase Tables (shared project, separate tables)
- `subscribers` (chat_id bigint PK, lat float, lng float, city_name text, created_at timestamptz)
- `ai_alerted_fires` (fire_key text, chat_id bigint, alerted_at timestamptz) — PK: (fire_key, chat_id)

## Key Patterns
- Supabase client uses lazy init (getSupabase()) — NOT module scope (Netlify build crash)
- FIRMS data cached 15min in-memory to avoid rate limits
- Geo utilities in src/lib/geo.ts (haversine, isUpwind, smokeEta)
- Bot accepts GPS location OR /ciudad <name> (geocoded via Open-Meteo)
- Alert dedup: fire_key = lat_lng_date, checked per subscriber
- Dispersion model: haversine distance + wind direction → isUpwind + ETA

## Proyecto Whitebay
Este proyecto es parte del ecosistema Whitebay.
