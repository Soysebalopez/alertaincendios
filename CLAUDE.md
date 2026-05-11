@AGENTS.md

# CLARA (AlertaIncendios)

Central de Localizacion y Alerta de Riesgo Ambiental — alerta temprana de incendios forestales en Argentina vía Telegram. Detección dual: GOES-19 (10 min, preliminar) + NASA FIRMS (15 min, confirmado). Gratuito B2C, complementario a Satellites On Fire.

## Stack
- Next.js 16 + TypeScript + Tailwind CSS v4 + Motion + Phosphor Icons + Leaflet + Recharts
- Supabase (shared with SatAI, ref: qmzuwnilehldvobjsbcs) — Postgres + pg_cron + pg_net + Auth
- Vercel Hobby — Next.js routes (TS) + 1 Python Vercel Function (`api/goes-sync.py`)
- Groq llama-3.3-70b (AI citizen summaries + interpretation)
- Python pipeline: xarray, netCDF4, boto3, pyproj — procesa GOES NetCDF en Vercel

## Servicios
- GitHub: https://github.com/Soysebalopez/alertaincendios
- Linear: CLARA project en Whitebay Products team
- Deploy: Vercel (https://alertaincendios.vercel.app)
- Supabase: project ref qmzuwnilehldvobjsbcs (shared with SatAI)
- Telegram Bot: @AlertasClaraBot

## Design System
- Font: Outfit (headings + body) + Geist Mono (data/labels)
- Palette: near-black (#0a0a08), warm beige foreground (#d4d4cc), burnt orange accent (#e8622c)
- Surfaces: #131311, #1a1a17 — borders: #252520 — muted: #8a8a7e
- Coordinate grid overlay (60px, accent tint)
- Ember particles (CSS, float up), scanline effect
- Nav text uses color-mix(in oklab, foreground 80%, transparent)

## Architecture

### Pages
- Landing: `/` — split-screen hero (fire count + Leaflet map), live city slider, 6 data sources (3×2 grid), "Cómo funciona", evolución de focos, calidad del aire, CTA "Recibí la alerta antes"
- Mapa: `/mapa` — fullscreen Leaflet con capas focos/aire/viento. Layout propio (sin footer)
- Calidad del aire: `/calidad-aire` — selector de provincia → cards por ciudad
- Ciudad: `/ciudad/[province]/[city]` — SSG 78 páginas, dashboard completo por ciudad
- Historial: `/historial` — Recharts evolución de focos
- Cómo funciona: `/como-funciona` — FAQ ciudadano (8 preguntas, sin jerga)
- Dashboard: `/dashboard`, `/dashboard/alerts`, `/dashboard/health` — métricas internas, gated por Supabase Auth allowlist (soysebalopez@gmail.com)
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
- `/api/bot/telegram` — webhook Telegram

### API Routes — Cron (auth CRON_SECRET)
- `/api/fires/sync` — manual FIRMS sync (IP residencial)
- `/api/alerts` — FIRMS → Telegram, con confirmation upgrade si matchea preliminary GOES (<5km, <2h)
- `/api/goes-sync` — **Python**, descarga GOES-19 ABI-L2-FDCF, filtros, inserta en goes_preliminary, guarda stats en goes_sync_runs
- `/api/goes-alerts` — preliminary → Telegram + tracking en goes_alerted
- `/api/goes-dismissals` — falsa alarma + DELETE preliminary descartadas + huérfanos
- `/api/lightning-alerts` — tormenta seca (OpenWeather + Open-Meteo fallback)

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

### Lightning
- `lightning_alerted` (id bigserial PK, chat_id, alerted_at) — rate-limit 30 min/sub

### Config
- `_clara_config` (key PK, value, updated_at) — actualmente solo `cron_secret`. Cron jobs leen via `clara_cron_secret()` SECURITY DEFINER

## Supabase pg_cron Jobs
- `fires-fetch` (`0,15,30,45 * * * *`) — pg_net GET a FIRMS, stores request_id
- `fires-process` (`2,17,32,47 * * * *`) — parsea CSV, REEMPLAZA fires_cache
- `fires-alerts` (`4,19,34,49 * * * *`) — `/api/alerts` (FIRMS + confirmation upgrades)
- `fires-daily-snapshot` (`55 2 * * *` = 23:55 ART) — snapshot diario
- `goes-sync` (`5,15,25,35,45,55 * * * *`) — `/api/goes-sync` Python pipeline
- `goes-alerts` (`7,17,27,37,47,57 * * * *`) — `/api/goes-alerts` preliminary → Telegram
- `goes-dismissals` (`37 * * * *` hourly) — falsa alarma + DELETE preliminary descartadas + huérfanos
- `goes-prune` (`30 3 * * *` daily) — cleanup defensivo >7 días

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
- Dual-channel alerts: civilian (con AI interpretation) vs fireman (operativo, sin AI, firmado por cuartel) — determinado por `subscribers.role`
- Doble confirmación: preliminary GOES → confirmation upgrade FIRMS si <5km/<2h → dismissal automático tras 4h
- Preliminaries descartadas se BORRAN de goes_preliminary (cascade goes_alerted) — el landing metric "Preliminares activos" refleja solo lo pendiente

## SEO
- Title template: "%s — CLARA"
- robots.ts: allow all excepto /api/, /dashboard, /login
- sitemap.ts: estáticas + 78 ciudades + /como-funciona = ~85 URLs
- JSON-LD: WebApplication en root layout, Place + GeoCoordinates por ciudad
- OG image dinámica via `next/og` ImageResponse en `src/app/opengraph-image.tsx` (1200×630)
- OpenGraph + Twitter cards en todas las páginas

## Seguridad (WHI-586 auditado)
- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy en `next.config.ts`
- RLS habilitado en todas las tablas, anon/auth roles bloqueados — service_role bypassea
- Migrado al nuevo sistema de API keys de Supabase: `sb_publishable_*` (anon) + `sb_secret_*` (service role). Legacy JWT system disabled.
- CRON_SECRET centralizado en `_clara_config` + `clara_cron_secret()` función — no literal en cron jobs
- Secrets fuera del repo (.env*, scripts/*.env gitignored). Templates en *.env.example
- Procedimiento de rotación documentado en `SECURITY-AUDIT.md`

## Project Status (2026-05-11)
- **Fase 1** Mejoras inmediatas: 67% (falta WHI-542 dominio — owner action)
- **Fase 2** GOES detection: ✅ **100%** (WHI-545/546/547 + v2/v3 + filter funnel)
- **Fase 3** Optimización: solo queda WHI-550 WhatsApp — owner action. WHI-548 (GLM) y WHI-549 (super-res) Canceled con docs.

### Tickets cerrados recientes
- WHI-545: pipeline GOES-19 production
- WHI-546: filtros v1/v2/v3 (mask, polígono ARG, urban, dedup, persistencia, Vaca Muerta, agricultural)
- WHI-547: doble confirmación (preliminary/confirmed/dismissed)
- WHI-581-585: bot rotation, mensajes mejorados, landing reorder, página /como-funciona, filtros v3
- WHI-586: auditoría de seguridad + rotación completa de secrets
- WHI-587: dashboard interno (Supabase Auth, métricas, filter funnel)
- WHI-588: rol fireman v1 (Sprint 1 deployed)
- WHI-589: reorden landing
- WHI-590: página /como-funciona
- WHI-582: OG image dinámica

### Pendiente (owner action)
- WHI-542 dominio propio
- WHI-550 WhatsApp Business
- WHI-591 SMS (análisis hecho, decisión pendiente)

## Docs en el repo
- `README.md` — overview para humanos + bot commands + APIs
- `TESTING.md` — recipes de verificación end-to-end (incluye inyección de focos sintéticos)
- `SECURITY-AUDIT.md` — findings + procedimiento de rotación de secrets
- `scripts/goes-spike/REPORT.md` — viabilidad pipeline GOES (referencia histórica)
- `scripts/glm-spike/REPORT.md` — GLM evaluation (defer)
- `scripts/super-res-research/REPORT.md` — super-resolución (rejected)
- `scripts/WHI-581-bot-rotation.md` — procedimiento rotación bot

## Proyecto Whitebay
Este proyecto es parte del ecosistema Whitebay.
