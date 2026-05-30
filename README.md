# AlertaForestal — Alertas tempranas de incendios forestales en Argentina

Plataforma de alerta temprana de incendios forestales para Argentina. Combina detección satelital de **NASA FIRMS** (~15 min, 375 m) con **NOAA GOES-19** (cada 10 min, 2 km) para avisar por Telegram con tiempo suficiente para actuar. Las alertas las manda **Clara**, el bot del servicio. También alerta por tormentas eléctricas secas, la causa #1 natural de incendios.

**Gratuito y B2C** — para vecinos de zonas de riesgo. Si sos empresa, gobierno o aseguradora, usá [Satellites On Fire](https://www.satellitesonfire.com.ar/).

**Web:** [alertaforestal.org](https://alertaforestal.org)
**Bot:** [t.me/alertaforestal_bot](https://t.me/alertaforestal_bot)

## Qué hace

### 🔥 Detección dual de incendios

| Satélite | Cadencia | Resolución | Rol |
|---|---|---|---|
| **NOAA GOES-19** (ABI-L2-FDCF) | 10 min | 2 km | Alerta preliminar rápida (preview) |
| **NASA FIRMS** (VIIRS) | 15 min | 375 m | Confirmación precisa |

Cuando GOES detecta un foco, te llega un **mensaje preliminar** ("⚠️ Posible foco a Xkm"). Cuando FIRMS valida la detección, te llega un **upgrade** ("✅ Foco confirmado"). Si pasan 4h sin que NASA confirme, el sistema te avisa "✅ Falsa alarma" y borra la detección.

### 🌬️ Calidad del aire

NO₂, SO₂, O₃, PM2.5, PM10 y CO en las principales ciudades de las 24 provincias argentinas. Cada ciudad tiene su propia página con semáforo OMS, datos de viento y resumen ciudadano AI.

### ⚡ Tormentas eléctricas secas

Alerta preventiva cuando hay rayos + humedad <60% + lluvia <0.5 mm/h cerca tuyo. Toggle on/off con `/rayos`.

### 🗺️ Mapa interactivo

Argentina con 3 capas: focos activos, calidad del aire por ciudad, y dirección del viento. En tiempo real.

### 🚒 Modo bombero

Los bomberos voluntarios pueden activar el rol "fireman" con un código de invitación distribuido a su cuartel. Reciben mensajes operativos (sin interpretación AI, coords precisas, firmado por cuartel) en lugar de los civiles.

## Cómo funciona

```
NOAA GOES-19 ABI-L2-FDCF ──── cada 10 min escanea Argentina
       │                       (Python Vercel function descarga NetCDF de S3)
       ▼
Filtros: mask code + polígono ARG + urban + Vaca Muerta flaring + dedup 4km + persistencia
       │
       ▼
goes_preliminary ────► /api/goes-alerts ────► Telegram (preliminar)
       │                                              │
       │                                              ▼
       │                                       goes_alerted (tracking)
       │                                              │
NASA FIRMS VIIRS ──── cada 15 min                     │
       │                                              │
       ▼                                              │
fires_cache ────► /api/alerts ─── match ◄─────────────┘
       │              │       (<5km, <2h)
       │              ▼
       │      Telegram (confirmado / regular)
       │
       └─► /mapa, /historial, /calidad-aire, /ciudad/[prov]/[city]

OpenWeather + Open-Meteo (fallback) ──► /api/lightning-alerts ──► Telegram (tormenta seca)

Pg_cron daily ──► /api/goes-dismissals (hourly) ──► "falsa alarma" + DELETE preliminary
```

## Páginas

| Ruta | Descripción | Acceso |
|---|---|---|
| `/` | Landing con fire counter, preliminares activos, mapa, slider de ciudades | Público |
| `/mapa` | Mapa fullscreen — focos + aire + viento | Público |
| `/calidad-aire` | Selector de provincia → cards con semáforo + viento + resumen AI | Público |
| `/ciudad/[prov]/[city]` | Dashboard completo por ciudad (78 ciudades SSG) | Público |
| `/historial` | Gráfico de focos diarios (Recharts) | Público |
| `/como-funciona` | FAQ en español llano, 8 preguntas frecuentes | Público |
| `/dashboard` | Métricas internas del proyecto | Owner (Supabase Auth) |
| `/dashboard/alerts` | Log detallado de alertas 7 días | Owner |
| `/dashboard/health` | Estado de pg_cron + filter funnel GOES | Owner |
| `/login` | Login del dashboard | Público (gateway) |

## Bot de Telegram

[@alertaforestal_bot](https://t.me/alertaforestal_bot) — el menú nativo de Telegram (escribís `/`) muestra todas las opciones.

| Comando | Descripción |
|---|---|
| `/start` | Bienvenida + botón compartir ubicación + listado completo de comandos |
| `/ciudad <nombre>` | Suscribirse por nombre de ciudad |
| `/estado` | Focos activos cerca tuyo + última verificación |
| `/rayos` | Activar/desactivar alertas de tormenta seca |
| `/soybombero <código>` | Activar modo bombero (necesita código de cuartel) |
| `/about` | Sobre el proyecto |
| `/help` | Lista de comandos |
| `/cancelar` | Eliminar suscripción |

## Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS v4, Leaflet, Recharts, Motion, Phosphor Icons
- **Backend**: Vercel Hobby (serverless TypeScript + Python Vercel Function), Supabase (Postgres + pg_cron + pg_net + Auth)
- **AI**: Groq llama-3.3-70b (interpretación de focos, resúmenes ciudadanos)
- **Datos satelitales**: NASA FIRMS VIIRS, NOAA GOES-19 ABI-L2-FDCF (vía AWS Open Data, anonymous), Open-Meteo, ESA CAMS/Sentinel-5P
- **Auth dashboard**: `@supabase/ssr` con login email/password, allowlist single-user
- **Pipeline NetCDF**: Python con xarray + pyproj + netCDF4 en Vercel Function

## APIs

| Endpoint | Método | Acceso | Descripción |
|---|---|---|---|
| `/api/fires` | GET | Público | Focos activos (FIRMS cache) |
| `/api/fires/history?months=N` | GET | Público | Historial diario |
| `/api/air-quality?lat=X&lng=Y` | GET | Público | 6 contaminantes + nivel OMS |
| `/api/wind?lat=X&lng=Y` | GET | Público | Viento + temp + humedad |
| `/api/summary?lat=X&lng=Y&city=Name` | GET | Público | Resumen ciudadano AI |
| `/api/history?lat=X&lng=Y&pollutant=NO2&days=7` | GET | Público | Historial de contaminante |
| `/api/simulate` | POST | Público | Dispersión gaussiana de humo |
| `/api/bot/telegram` | POST | Webhook Telegram | Comandos del bot |
| `/api/fires/sync?secret=...` | GET | CRON_SECRET | Sync FIRMS manual |
| `/api/alerts?secret=...` | GET | CRON_SECRET | Cron: FIRMS → Telegram + confirmation upgrades |
| `/api/goes-sync?secret=...` | GET | CRON_SECRET | **Python** — pipeline GOES |
| `/api/goes-alerts?secret=...` | GET | CRON_SECRET | Cron: preliminary GOES → Telegram |
| `/api/goes-dismissals?secret=...` | GET | CRON_SECRET | Cron: falsa alarma + purge |
| `/api/lightning-alerts?secret=...` | GET | CRON_SECRET | Cron: tormenta seca |

## Pg_cron (Supabase)

Todo el scheduling corre en Postgres con `pg_cron` + `pg_net`. El secret se lee de la función `clara_cron_secret()` (tabla `_clara_config`), no embedded en cada job.

| Job | Frecuencia | Acción |
|---|---|---|
| `fires-fetch` | `:00,:15,:30,:45` | HTTP GET a FIRMS via pg_net |
| `fires-process` | `:02,:17,:32,:47` | Parsea CSV, upsert fires_cache |
| `fires-alerts` | `:04,:19,:34,:49` | Evalúa focos vs suscriptores → Telegram |
| `fires-daily-snapshot` | `23:55 ART` | Snapshot diario para historial |
| `goes-sync` | `:05,:15,:25,:35,:45,:55` | Python: descarga GOES NetCDF + filtros + insert |
| `goes-alerts` | `:07,:17,:27,:37,:47,:57` | Preliminary GOES → Telegram |
| `goes-dismissals` | `:37 hourly` | Falsa alarma + DELETE preliminaries descartadas + huérfanos |
| `goes-prune` | `3:30 UTC daily` | Cleanup defensivo (>7 días sin alerted) |
| `lightning-alerts` | `:11,:26,:41,:56` | Tormenta seca → Telegram (rate-limit 30 min/sub) |

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Vercel | Token de @BotFather |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Publishable key (sb_publishable_*) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Secret key (sb_secret_*) — server-side only |
| `GROQ_API_KEY` | Vercel | API key de Groq |
| `OPENWEATHER_API_KEY` | Vercel | Para lightning alerts (opcional, fallback Open-Meteo) |
| `CRON_SECRET` | Vercel + Supabase `_clara_config` | Auth para endpoints de cron |
| `MAP_KEY` (FIRMS) | `scripts/backfill.env` | Solo para correr backfill localmente |

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local   # completar con tus keys
npm run dev                         # http://localhost:3000
```

### Backfill histórico de focos

```bash
cp scripts/backfill.env.example scripts/backfill.env
chmod 600 scripts/backfill.env     # completar MAP_KEY y SUPABASE_TOKEN
./scripts/backfill-fires.sh 365    # 365 días hacia atrás
```

### Sync local de FIRMS (si tu servidor está bloqueado por NASA)

```bash
cp scripts/sync-fires.env.example scripts/sync-fires.env
chmod 600 scripts/sync-fires.env   # completar CRON_SECRET
# Agregar a crontab:
*/15 * * * * /ruta/al/repo/scripts/sync-fires.sh >> /tmp/fires-sync.log 2>&1
```

## Datos abiertos utilizados

| Fuente | Uso | Costo |
|---|---|---|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) VIIRS | Focos confirmados (375m, ~15min) | Gratis |
| [NOAA GOES-19](https://www.star.nesdis.noaa.gov/goes/) ABI-L2-FDCF | Focos preliminares (2km, 10min) vía AWS Open Data | Gratis |
| [Open-Meteo Air Quality](https://air-quality-api.open-meteo.com/) | Contaminantes (CAMS/Sentinel-5P) | Gratis |
| [Open-Meteo Forecast](https://open-meteo.com/) | Viento, temperatura, humedad | Gratis |
| [OpenWeather One Call 3.0](https://openweathermap.org/) | Rayos (con Open-Meteo fallback) | Free tier |
| [Groq](https://groq.com/) | llama-3.3-70b para interpretación | Free tier |

## SEO

- OG image dinámica vía `next/og` (`/opengraph-image`)
- Sitemap con 84 URLs (estáticas + 78 ciudades SSG)
- robots.txt (permite todo excepto `/api/`)
- JSON-LD: WebApplication + Place/GeoCoordinates por ciudad
- OpenGraph + Twitter cards en todas las páginas
- Títulos con template: "%s — CLARA"

## Seguridad

Ver `SECURITY-AUDIT.md` para el procedimiento de rotación de secrets, headers HTTP aplicados, y deuda técnica pendiente.

- HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- RLS habilitado en todas las tablas, service role solo server-side
- Migrado al sistema nuevo de API keys de Supabase (`sb_publishable_*` + `sb_secret_*`)
- CRON_SECRET centralizado en `_clara_config` + función `clara_cron_secret()` SECURITY DEFINER
- Secrets fuera del repo, `.env*` gitignored

## Testing

Ver `TESTING.md` para la guía completa: queries SQL para verificar pipelines, cómo inyectar focos sintéticos, recipes de testing por feature.

## Backlog pendiente

| Ticket Linear | Bloqueado por |
|---|---|
| **WHI-542** Dominio propio | Owner (compra + DNS) |
| **WHI-550** WhatsApp Business como canal alternativo | Owner (Meta Business verification) |
| **WHI-591** SMS análisis | Análisis hecho — decisión pendiente |

## Roadmap completo

Ver Linear: [CLARA project](https://linear.app/white-bay/project/clara-2ad7d07570f3).

- **Fase 1** Mejoras inmediatas: 67% (falta dominio)
- **Fase 2** Mejorar tiempo de detección con GOES: ✅ **100%**
- **Fase 3** Optimización: solo queda WhatsApp (GLM y super-res investigados y descartados con docs en `scripts/glm-spike/REPORT.md` y `scripts/super-res-research/REPORT.md`)

## Licencia

Proyecto [Whitebay](https://whitebay.dev). Hecho con cariño en Bahía Blanca.
