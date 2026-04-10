# CLARA — Central de Localizacion y Alerta de Riesgo Ambiental

Plataforma de monitoreo ambiental ciudadano para Argentina. Detecta focos de calor, monitorea calidad del aire en 80+ ciudades, y traduce datos tecnicos a lenguaje simple con inteligencia artificial.

**Web:** [alertaincendios.vercel.app](https://alertaincendios.vercel.app)
**Bot:** [t.me/AlertaIncendiosBot](https://t.me/AlertaIncendiosBot)

## Que hace

### Incendios
Cada 15 minutos consultamos NASA FIRMS para detectar focos de calor en toda Argentina. Si hay uno cerca tuyo y el viento empuja el humo hacia tu zona, te alertamos por Telegram con la distancia, potencia y tiempo estimado de llegada.

### Calidad del aire
Monitoreamos NO2, SO2, O3, PM2.5, PM10 y CO en las principales ciudades de las 24 provincias argentinas. Cada ciudad tiene su propia pagina con semaforo OMS, datos de viento, y un resumen en lenguaje ciudadano generado por IA.

### Mapa interactivo
Mapa de Argentina con tres capas: focos de calor activos, calidad del aire por ciudad, y direccion del viento. Todo en tiempo real.

## Como funciona

```
Satelite VIIRS ──── cada ~6h escanea Argentina (375m resolucion)
       |
       v
NASA FIRMS ──── procesa y publica focos de calor
       |
       v
Supabase pg_cron ──── cada 15 min consulta FIRMS
       |
       v
fires_cache ──── focos activos en toda Argentina
       |
       ├── /mapa ──── visualizacion en mapa Leaflet
       ├── /historial ──── grafico de evolucion diaria
       └── /api/alerts ──── evalua vs suscriptores → Telegram

Open-Meteo ──── calidad del aire + viento por ciudad
       |
       v
Groq AI ──── traduce datos a lenguaje ciudadano
       |
       ├── /calidad-aire ──── selector de provincia → cards por ciudad
       └── /ciudad/[prov]/[city] ──── dashboard completo por ciudad
```

## Paginas

| Ruta | Descripcion |
|------|-------------|
| `/` | Landing con fire counter, mapa, slider de 10 ciudades al azar |
| `/mapa` | Mapa fullscreen — capas: focos, aire, viento |
| `/calidad-aire` | Selector de provincia → cards con semaforo + viento + resumen AI |
| `/ciudad/[prov]/[city]` | Dashboard completo: semaforo, viento, mapa zoom, evolucion de contaminantes |
| `/historial` | Grafico de focos de calor diarios (Recharts) |

## Bot de Telegram

[@AlertaIncendiosBot](https://t.me/AlertaIncendiosBot)

| Comando | Descripcion |
|---------|-------------|
| `/start` | Bienvenida + boton para compartir ubicacion |
| `/ciudad <nombre>` | Suscribirse por nombre de ciudad |
| `/estado` | Ver focos cercanos + interpretacion AI |
| `/cancelar` | Cancelar suscripcion |

## Stack

- **Frontend:** Next.js 16, TypeScript, Tailwind CSS v4, Leaflet, Recharts, Motion
- **Backend:** Vercel (serverless), Supabase (Postgres + pg_cron + pg_net)
- **AI:** Groq llama-3.3-70b (resumenes ciudadanos, interpretacion de datos)
- **Datos:** NASA FIRMS VIIRS, Open-Meteo (aire + viento), ESA CAMS/Sentinel-5P

## APIs

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/fires` | GET | Focos activos desde Supabase cache |
| `/api/fires/history?months=6` | GET | Historial diario de focos |
| `/api/air-quality?lat=X&lng=Y` | GET | Calidad del aire (6 contaminantes + nivel OMS) |
| `/api/wind?lat=X&lng=Y` | GET | Viento: velocidad, direccion en espanol, temp |
| `/api/summary?lat=X&lng=Y&city=Name` | GET | Resumen ciudadano AI |
| `/api/history?lat=X&lng=Y&pollutant=NO2&days=7` | GET | Historial de contaminante |
| `/api/simulate` | POST | Simulacion de dispersion (modelo gaussiano) |
| `/api/bot/telegram` | POST | Webhook del bot |

## Datos automaticos (pg_cron)

Todo el sync de datos corre desde Postgres, sin dependencias externas:

| Job | Frecuencia | Accion |
|-----|------------|--------|
| `fires-fetch` | Cada 15 min | HTTP GET a FIRMS via pg_net |
| `fires-process` | Cada 15 min (+2 min) | Parsea CSV, actualiza fires_cache |
| `fires-alerts` | Cada 15 min (+4 min) | Evalua focos vs suscriptores |
| `fires-daily-snapshot` | Diario 23:55 ART | Guarda count diario para historial |

## Variables de entorno

| Variable | Descripcion |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Token de @BotFather |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `GROQ_API_KEY` | API key de Groq (gratis) |
| `CRON_SECRET` | Secret para endpoints de cron |

## Desarrollo local

```bash
npm install
cp .env.local.example .env.local  # completar con tus keys
npm run dev                        # http://localhost:3000
```

### Backfill de datos historicos

```bash
# Cargar historial de focos (requiere IP residencial, FIRMS bloquea datacenters)
bash scripts/backfill-fires.sh 365
```

## Fuentes de datos

| Fuente | Uso | Costo |
|--------|-----|-------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Focos de calor (VIIRS SNPP, 375m) | Gratis |
| [Open-Meteo Air Quality](https://air-quality-api.open-meteo.com/) | Contaminantes (CAMS/Sentinel-5P) | Gratis |
| [Open-Meteo Forecast](https://open-meteo.com/) | Viento, temperatura, humedad | Gratis |
| [Groq](https://groq.com/) | Resumenes ciudadanos (llama-3.3-70b) | Gratis |

## SEO

- Sitemap con 84 URLs (estaticas + 78 ciudades SSG)
- robots.txt (permite todo excepto /api/)
- JSON-LD: WebApplication + Place/GeoCoordinates por ciudad
- OpenGraph + Twitter cards en todas las paginas
- Titulos con template: "%s — CLARA"

## Licencia

Proyecto [Whitebay](https://whitebay.dev).
