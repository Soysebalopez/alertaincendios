# AlertaIncendios Argentina

Sistema de alerta temprana de incendios forestales para Argentina. Detecta focos de calor via satelite (NASA FIRMS) y alerta por Telegram con modelo de dispersion de humo.

**Landing:** [alertaincendios.vercel.app](https://alertaincendios.vercel.app)
**Bot:** [t.me/AlertaIncendiosBot](https://t.me/AlertaIncendiosBot)

## Como funciona

```
NASA FIRMS (satelite VIIRS)
        |
        v
  Supabase pg_cron ──── cada 15 min fetch + parse CSV
        |
        v
  fires_cache (jsonb) ──── 104+ focos en toda Argentina
        |
        v
  /api/alerts ──── evalua cada foco vs cada suscriptor
        |
        v
  Modelo de dispersion ──── haversine + viento + ETA humo
        |
        v
  Telegram ──── alerta con distancia, potencia, Google Maps
```

1. **Deteccion:** El satelite Suomi NPP (sensor VIIRS, 375m de resolucion) escanea la superficie terrestre y detecta puntos de calor anomalos
2. **Sync:** Cada 15 minutos, `pg_cron` en Supabase consulta NASA FIRMS y cachea los focos activos en toda Argentina
3. **Dispersion:** Para cada foco, se consulta el viento en tiempo real (Open-Meteo) y se calcula si el humo se dirige hacia cada suscriptor
4. **Alerta:** Si un foco esta a menos de 100 km y el viento lo empuja hacia tu ubicacion, recibis una alerta por Telegram con distancia, potencia termica (FRP) y ETA del humo

## Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS v4, Leaflet, Motion
- **Backend:** Vercel (serverless), Supabase (Postgres + pg_cron + pg_net)
- **Bot:** Telegram Bot API, Groq (AI interpretation)
- **Datos:** NASA FIRMS VIIRS, Open-Meteo (viento + geocoding)

## Bot de Telegram

Abri [@AlertaIncendiosBot](https://t.me/AlertaIncendiosBot) y:

| Comando | Descripcion |
|---------|-------------|
| `/start` | Bienvenida + boton para compartir ubicacion |
| `/ciudad <nombre>` | Suscribirse por nombre de ciudad |
| `/estado` | Ver focos cercanos + interpretacion AI |
| `/cancelar` | Eliminar suscripcion |

Tambien podes enviar tu ubicacion GPS directamente.

## Arquitectura

```
src/
  app/
    page.tsx                    # Landing — mapa Leaflet + fire counter
    api/
      fires/route.ts            # GET — focos desde Supabase cache
      fires/sync/route.ts       # GET — sync manual FIRMS → Supabase
      alerts/route.ts           # GET — cron: evalua focos vs suscriptores
      bot/telegram/route.ts     # POST — webhook Telegram
  lib/
    firms.ts                    # FIRMS client + Supabase cache read/write
    geo.ts                      # haversine, isUpwind, smokeEta
    wind.ts                     # Open-Meteo wind data
    geocode.ts                  # Open-Meteo geocoding (ciudad → lat/lng)
    telegram.ts                 # sendMessage helper
    supabase.ts                 # lazy-init Supabase client
  components/
    fire-map.tsx                # Leaflet map con focos coloreados por FRP
    fire-map-loader.tsx         # Dynamic import wrapper (no SSR)
    fire-counter.tsx            # Animated counter (rolls up from 0)
    status-beacon.tsx           # Pulsing live indicator
    stagger-reveal.tsx          # Staggered fade-up animation
    ember-particles.tsx         # CSS ember particle system
```

## Supabase (pg_cron)

El sync de datos corre 100% desde Postgres, sin dependencias externas:

| Job | Schedule | Accion |
|-----|----------|--------|
| `fires-fetch` | `:00, :15, :30, :45` | HTTP GET a FIRMS via pg_net |
| `fires-process` | `:02, :17, :32, :47` | Parsea CSV, actualiza fires_cache |
| `fires-alerts` | `:04, :19, :34, :49` | Llama /api/alerts en Vercel |

## Variables de entorno

| Variable | Descripcion |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase |
| `FIRMS_API_KEY` | MAP_KEY de NASA FIRMS (gratis) |
| `GROQ_API_KEY` | API key de Groq (gratis) |
| `CRON_SECRET` | Secret para autenticar endpoints de cron |

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local  # completar con tus keys
npm run dev                        # http://localhost:3000
```

## Fuentes de datos

| Fuente | Uso | Costo |
|--------|-----|-------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Focos de calor (VIIRS SNPP) | Gratis (requiere MAP_KEY) |
| [Open-Meteo](https://open-meteo.com/) | Viento + geocoding | Gratis |
| [Groq](https://groq.com/) | Interpretacion AI (llama-3.3-70b) | Gratis (rate limited) |

## Licencia

Proyecto [Whitebay](https://whitebay.dev).
