# Auditoría de plataforma + propuestas de mejora — AlertaForestal

> **Fecha:** 2026-06-30
> **Alcance:** todo el código de producto (Next.js 16 TS + pipeline Python FWI), API/cron/auth, bot Telegram, frontend, librerías de datos, dashboard interno, motor FWI / estructura de provincias-biomas, e higiene de repo/config.
> **Método:** 5 auditorías paralelas independientes (un frente por subsistema) + verificación directa de higiene/config/ocultamiento. Cada hallazgo está verificado contra el código real, con `archivo:línea`.
> **Estado de la estructura FWI/provincias:** se revisó completa pero **se mantiene inaccesible** (no se publica nada). Ver §4.

---

## 1. Resumen ejecutivo (en simple)

La plataforma está **bien construida y el corazón científico es sólido**: el índice de peligro de incendio (FWI) calcula igual que la referencia internacional, y la estructura de las 35 zonas de las 23 provincias está perfectamente ordenada y consistente. La parte oculta de provincias está bien tapada (no la encuentra Google ni hay links a ella).

Dicho eso, la auditoría encontró **un problema serio y silencioso que hay que arreglar sí o sí**: cuando le mandamos un mensaje a un usuario por Telegram, el sistema **no se entera si el envío falló**. Resultado: si Telegram rechaza el mensaje (porque el usuario bloqueó al bot, o por un error temporal, o porque el nombre de la ciudad tiene un caracter raro), **la alerta de incendio se pierde para siempre y nosotros creemos que se envió**. Para un servicio de alerta temprana, eso es lo más grave que puede pasar.

Hay además una **bomba de tiempo de crecimiento**: el sistema lee los suscriptores sin paginar, y se corta solo a 1.000. Apenas pasemos los 1.000 usuarios, **los que sobran dejan de recibir alertas sin ningún aviso**. Hoy no se nota; el día que funcione el go-to-market, explota.

Y hay dos **métricas del dashboard que mienten** (justo las que se usan para decidir a dónde expandir): "Top provincias" en realidad muestra ciudades, y la curva de "crecimiento de suscriptores" arranca en cero e ignora la base que ya existe.

El resto son mejoras de robustez (timeouts, escapes, límites de uso), de accesibilidad y de limpieza. Nada de esto es catastrófico, pero varios son baratos de arreglar y suman mucha confiabilidad.

En la §6 hay **10 funcionalidades nuevas** pensadas desde la prevención, todas factibles con lo que ya tenemos (mismas fuentes de datos gratuitas, misma infraestructura, sin presupuesto extra) y todas medibles.

### Conteo de hallazgos

| Severidad | Cantidad | Qué significa |
|---|---|---|
| 🔴 Crítico | 2 | Rompe la función central (entrega de alertas) o una métrica de decisión clave |
| 🟠 Alto | 9 | Pérdida de alertas, falla a escala, o dato falso visible al usuario |
| 🟡 Medio | 14 | Robustez, consistencia, abuso potencial, accesibilidad |
| ⚪ Bajo | ~20 | Higiene, deuda de documentación, edge-cases improbables |

---

## 2. Metodología

Se lanzaron 5 auditorías independientes en paralelo, una por subsistema, para maximizar cobertura y obtener **corroboración cruzada** (cuando dos auditorías independientes marcan el mismo `archivo:línea`, la confianza sube):

1. **API routes / cron / auth** — 18 rutas + `cron-auth`, `ratelimit`, `supabase`, `middleware`.
2. **Motor FWI / estructura de provincias-biomas** — `fire_danger/*.py`, `api/fire-danger-sync.py`, `fire-danger.ts`, páginas `/provincia`, componentes `danger/*`, thresholds, SQL.
3. **Frontend público** — landing, mapa, ciudad, calidad-aire, historial, como-funciona, cuarteles + todos los componentes.
4. **Bot Telegram / mensajería** — webhook, `telegram.ts`, mensajes de prevención, filtros por rol, teclados.
5. **Librerías de datos / dashboard** — aire, dispersión, satélites, geo, métricas del dashboard, login.

Más una verificación directa de higiene de repo, headers de seguridad y del ocultamiento de `/provincia`.

> **No verificable desde el repo** (depende de variables de entorno en Vercel, fuera de alcance): si `TELEGRAM_WEBHOOK_SECRET` y `UPSTASH_REDIS_*` están seteados en producción. Cambian la severidad real de M1 y de los hallazgos de rate-limit. **Acción recomendada: confirmar ambos en el dashboard de Vercel.**

---

## 3. Hallazgos de auditoría

### 3.1 🔴 Críticos

#### C1 — `sendMessage` ignora los errores de la API de Telegram *(corroborado por 2 auditorías independientes)*
**`src/lib/telegram.ts:5-23`** (también `editMessageText`, `answerCallbackQuery`)
`sendMessage` hace `await fetch(...)` y **descarta la respuesta**: no chequea `res.ok` ni lanza error. Telegram devuelve `403` cuando el usuario bloqueó el bot, `429` (con `retry_after`) en rate-limit, `400` cuando el HTML del mensaje está mal formado. Todos esos casos son una `Response` resuelta, **no** un throw.

**Impacto en cascada:** el patrón de entrega diseñado en `/api/alerts`, `/api/goes-alerts`, `/api/lightning-alerts` y `/api/prevention-alerts` es *"INSERT como lock → enviar → si falla, loguear/reintentar"*. Como `sendMessage` nunca lanza, **el `catch (sendErr)` jamás corre**: la fila de dedup queda marcada como "enviada" aunque el mensaje no haya llegado, y nunca se reintenta. Consecuencias:
- Una alerta de incendio rechazada por un error transitorio **se pierde permanentemente**.
- Los contadores (`alertsSent++`) cuentan envíos que Telegram rechazó → métricas infladas.
- Los usuarios que bloquearon el bot **nunca se limpian** y gastan un fetch de viento por foco × ciclo, para siempre.

**Fix:** chequear `res.ok`; si `!ok`, leer el body y lanzar (`telegram ${status}`). Manejar `403`/"blocked"/"deactivated" como señal para dar de baja al subscriber, y `429` respetando `parameters.retry_after`. **Es prerrequisito de casi todo lo demás** (sin esto, A2/A4/M9 quedan ocultos).

#### C2 — "Top provincias" del dashboard muestra ciudades, no provincias
**`src/app/dashboard/_lib/metrics.ts:178-192`**
`getTopProvinces()` deriva la provincia con `city_name.split(",")`, asumiendo formato `"Ciudad, Provincia"`. Pero al registrar al subscriber (`bot/telegram/route.ts:454/512/797`) se persiste `geo.name` (**solo la ciudad**); `geo.admin1` (la provincia) se usa para el label efímero del mensaje y se **descarta**. El coma casi nunca existe → cae al branch `: key` y agrupa por nombre de ciudad.

**Impacto:** el panel "Top provincias por suscriptores" — una de las métricas que CLAUDE.md marca como foco para go-to-market — está mal etiquetado y agrupa mal. Decisiones de expansión sobre datos falsos.
**Fix:** persistir `admin1` en una columna `province` del subscriber y agrupar por ella (requiere migración + backfill, o re-derivar por lat/lng). Mientras tanto, renombrar el panel a "Top ciudades" para no engañar.

---

### 3.2 🟠 Altos

#### A1 — `subscribers` se lee sin paginación: cap silencioso a 1.000 *(corroborado por 2 auditorías)*
**`api/alerts/route.ts:38` · `goes-alerts:59` · `lightning-alerts:22` · `prevention-alerts:60`**
Los cuatro crons hacen `db.from("subscribers").select(...)` sin `.range()`. PostgREST devuelve como máximo `max-rows` (default **1.000**) sin avisar. Apenas el servicio supere los 1.000 suscriptores, **todos los que excedan dejan de recibir alertas, sin error ni log** — el modo de falla más grave para un producto de alerta temprana. Aplica también a `goes_preliminary` (un lookback de 30 min en temporada alta puede traer >1.000).
**Fix:** paginar con `.range()` en loop hasta vaciar, o invertir el flujo (por subscriber). Como mínimo inmediato: **alertar si `subscribers.length === 1000`**.

#### A2 — `city_name` / `cuartel_name` sin escapar en mensajes `parse_mode:HTML`
**`bot/telegram/route.ts:451-495` · `alerts/route.ts:293` · `lightning-alerts:57`**
Todos los mensajes van en HTML y interpolan crudo `${sub.city_name}` (de Open-Meteo geocoding) y `cuartel_name`. Un nombre con `&`, `<` o `>` rompe el parser de Telegram → responde **400** y el mensaje no se envía (y por C1, falla en silencio). El repo ya tiene un escaper en `cuarteles/request/route.ts:52-53` que no se reutiliza.
**Fix:** helper `escapeHtml()` compartido aplicado a `city_name`, `cuartel_name`, `zoneName` y todo string externo antes de interpolar.

#### A3 — Llamadas a APIs externas sin timeout + `fetchWind` en loop N×M
**`firms.ts:86` · `wind.ts:35` · `lightning.ts:60` · `geocode.ts:16` · `telegram.ts:13` · `satellites/sync-tles:32`**
Ningún `fetch` externo usa `AbortSignal.timeout()` (solo `ratelimit.ts` y `healthcheck.ts` lo hacen). En `/api/alerts`, `fetchWind` se llama **dentro del doble loop foco × subscriber** (`alerts/route.ts:84`): la misma ubicación se consulta una vez por subscriber afectado → cientos/miles de requests a Open-Meteo por ciclo de 15 min, contra cuota gratuita y sin timeout. Una respuesta colgada bloquea el cron entero hasta el límite de la función Vercel y deja pares foco/subscriber sin evaluar.
**Fix:** `signal: AbortSignal.timeout(5000)` en todos los fetch externos + retry corto en los críticos; **cachear el viento por `fireKey`** (Map) en lugar de por par.

#### A4 — El briefing diario de prevención reclama idempotencia *antes* de enviar
**`api/prevention-alerts/route.ts:110`**
En modo `daily` hace `INSERT prevention_briefing_sent` (claim) y luego `await sendMessage`. Cuando se arregle C1 y `sendMessage` empiece a lanzar, un fallo transitorio dejará el claim puesto: el usuario **no recibe el briefing de ese día** y el cron no reintenta. Inconsistente con la rama `alerts` del mismo handler (marca *después* del send).
**Fix:** enviar primero y hacer el claim después, o borrar el claim (`delete`) si el envío falla.

#### A5 — `/ciudad` sin argumento responde "comando no reconocido" (rama de ayuda muerta)
**`bot/telegram/route.ts:115-118, 497-501`**
El dispatcher matchea `text.startsWith("/ciudad ")` (con espacio). `handleCiudad` tiene un branch `if (!query)` que muestra "Escribí el nombre de tu ciudad", pero es **inalcanzable**: `/ciudad` pelado no matchea el `startsWith` y cae en "Comando no reconocido". El usuario que escribe lo más natural recibe un error.
**Fix:** `text === "/ciudad" || text.startsWith("/ciudad ")` y derivar el arg con slice (mismo patrón que `/start`).

#### A6 — El número del hero renderiza "0 focos" en SSR
**`src/components/fire-counter.tsx:40`**
`FireCounter` siempre devuelve `<span>0</span>` en SSR; el valor real solo aparece tras hidratar (rAF). Usuarios sin JS, con JS lento, o durante el LCP del hero ven **"0 focos activos ahora mismo"** — mensaje falso y dañino para un servicio de alerta, en el dato más importante de la portada.
**Fix:** renderizar `{count}` como contenido SSR y animar desde ahí (animar solo cuando cambia en cliente).

#### A7 — `LiveCityGrid` usa `Math.random()` en render server-side → mismatch de hidratación
**`src/components/live-city-grid.tsx:62`**
Es `"use client"` pero se importa **directo** (sin `dynamic ssr:false`) en la landing server-side. Su `useState(() => pickRandomCities())` produce ciudades distintas en SSR vs. cliente → warning de hidratación React 19 + "salto" visual de las 12 cards.
**Fix:** envolver en `dynamic(..., { ssr:false })`, o sembrar la selección de forma determinista, o elegir en `useEffect` tras montar.

#### A8 — Errores en el modelo de dispersión de humo (pluma gaussiana)
**`src/lib/dispersion.ts:82-96, 215-223`**
Dos problemas: (a) el anillo de baja concentración calcula **distancia con ráfaga** (`gustMs`) pero **ETA con viento medio** (`windMs`) → tiempo inflado/inconsistente; (b) `isPointInPlume` usa rumbo *flat-earth* + convención matemática, mientras el resto del código usa haversine + convención brújula → puede clasificar mal qué ciudades caen en el cono de humo (peor a 25 km y en latitudes patagónicas).
**Impacto:** importante porque la dispersión es la base de la feature de pre-alerta a sotavento (§6, F3). **Arreglar antes de construir sobre ella.**
**Fix:** una sola velocidad por anillo para distancia y ETA; reusar el `bearingRad()` esférico de `forest-zones-geo.ts` y una sola convención angular. Agregar un test con caso conocido.

#### A9 — La curva "Crecimiento de suscriptores (30d)" arranca en 0 (ignora la base previa)
**`src/app/dashboard/_lib/metrics.ts:38-62`**
El acumulado solo suma altas dentro de la ventana de 30 días; los suscriptores creados antes no entran. La serie "cumulative" no es acumulada real → subreporta el total y hace parecer que el producto nació hace 30 días.
**Fix:** `count` separado de subs con `created_at < since` y usarlo como offset inicial del acumulado.

#### A10 — `math.sqrt(wind)` crashea con viento negativo en el motor FWI
**`fire_danger/fwi.py:25, 33, 77`**
`ffmc()` e `isi()` llaman `math.sqrt(wind)` sin clampear. Verificado en vivo: `fwi.ffmc(20,40,-5,0,85)` lanza `ValueError`. Un valor espurio de viento (<0) de Open-Meteo revienta `_sync_zone` (aislado per-zona: esa zona queda con la clase vieja del día anterior, sin aviso).
**Fix:** `w = max(wind, 0.0)` al inicio de `ffmc`/`isi`; clamp defensivo de `rh` (hoy solo tiene techo) y guard de `temp` NaN.

---

### 3.3 🟡 Medios

| ID | Archivo:línea | Hallazgo | Fix |
|---|---|---|---|
| M1 | `bot/telegram/route.ts:55` | Verificación de origen del webhook es **fail-open** si `TELEGRAM_WEBHOOK_SECRET` no está seteado → cualquiera puede POSTear updates falsos (`/cancelar` de un tercero, votos falsos, cambiar ubicación). | Fail-closed una vez confirmada la env en Vercel; mínimo, bloquear mutaciones destructivas sin secret. |
| M2 | `bot/telegram/route.ts:72` | `await request.json()` **sin try/catch** y fuera del try principal → body inválido = 500 = Telegram **reintenta** en loop. | Envolver y devolver `{ok:true}` 200 ante body inválido. |
| M3 | `api/simulate/route.ts:15,36` | Endpoint público POST **sin rate-limit** que hace fetch interno a `/api/wind` (sin header `x-clara-internal`) y recorre todas las ciudades → vector de abuso + consume el rate-limit del propio usuario. | `checkRateLimit` + pasar header interno al fetch. |
| M4 | `api/fires/route.ts:23` | Ante fallo de la fuente devuelve `{fires:[], count:0}` con **status 200** → el front no distingue "no hay focos" de "la API falló" y muestra 0. (`history` sí usa 502.) | Devolver 502/503 y que el front muestre estado de error. |
| M5 | `api/lightning-alerts/route.ts:69` | Dedup SELECT-then-INSERT **sin claim atómico** (a diferencia de alerts/goes) → alertas de tormenta duplicadas si dos crons se solapan. | INSERT con `ON CONFLICT` sobre constraint, o upsert condicionado. |
| M6 | `api/alerts/route.ts:210` | `buildFireKey` no incluye `acqTime` → un foco que escala el mismo día no re-alerta. **Posible decisión de diseño (1 alerta/foco/día)**, pero choca con "el fuego empeoró + cambió el viento". | Confirmar intención; si se quiere re-alertar en escalada, incluir `level`/`upwind` en la clave. |
| M7 | `goes-alerts/route.ts:91` · `alerts:63` | `isFireman = role === "fireman"`; cualquier otro rol (futuro `institucional`, typo, NULL) cae en filtro civilian **en silencio**. Bomba de tiempo para el producto B2G. | Enumerar roles; usar flag `forest_only` en vez de igualdad a string. |
| M8 | `bot/telegram/route.ts:319-351,402-428` | Toggle de `/rayos` es read-modify-write → race / divergencia con el menú de preferencias. | Toggle atómico en DB (`SET lightning_enabled = NOT COALESCE(...)`). |
| M9 | `prevention-alerts/route.ts:98-107` | Modo `alerts`: upsert de `prevention_alerted` **después** del send sin claim previo → posible duplicación de avisos de escalada. | Loguear si el upsert post-send falla; o claim-then-send con compensación. |
| M10 | `city/city-map.tsx:83-88,249` | "Focos cercanos" filtra por `√(Δlat²+Δlng²) < 1` grado (elipse 78-111 km) pero el copy dice "radio de 100 km", y **no filtra forestal** → cuenta distinto que `CityForestFires` en la misma página. | Usar `haversineKm` (ya existe) con 100 km reales + filtrar `f.forestZone`. |
| M11 | `globals.css` (global) | **Sin `@media (prefers-reduced-motion)`**; múltiples animaciones infinitas (embers ×12, thermal-pulse, beacon-ping) siempre activas → WCAG 2.3.3 + batería/CPU. | Bloque reduce-motion que apague animaciones/transiciones. |
| M12 | `components/live-status.tsx` | Componente **huérfano** (no se importa en ningún lado); arrastra fetches a Groq e intervalos. Riesgo de re-uso de código con bugs. | Eliminar el archivo (y keyframes `slide-*` si nada más las usa). |
| M13 | `map/argentina-map.tsx:429-460` | Efecto de repintado de focos lee `allFires.current` (ref) pero depende de `intensityCounts` solo como hack para forzar repintado → frágil; en el borde "0 focos" podría no pintar. | Mover `fires` a `useState` y depender de él explícitamente. |
| M14 | `forest-zones-geo.ts:183` (vía `firms.ts` / `getForestSplit:382`) | `findForestZone` **sin guard de NaN/lat-lng inválidos**; `getForestSplit` pasa lat/lng crudos de DB (a diferencia de `getSubscriberBreakdown`) → filas corruptas cuentan como "no forestal" en silencio. | `Number.isFinite` al inicio, devolver null explícito. |
| M15 | `forest-zones-geo.ts:78` vs `argentina-polygon.ts:49` | `pointInRing` divide por `(yj-yi)` **sin epsilon** (el otro módulo usa `+1e-12`) → riesgo div/0 en aristas horizontales; clasificadores que deberían ser idénticos difieren. CLAUDE.md pide paridad con el ray-casting de `goes-sync.py`. | Unificar ambos (mismo epsilon) y verificar paridad con Python. |
| M16 | `superadmin-metrics.ts:167-174` | "zombies"/"activos" solo cuenta subs que **alguna vez usaron un comando**; el bot es pasivo. El % se compara contra `subs.total` → numerador y denominador de universos distintos. | Definir zombie sobre el universo total (left-join subscribers ↔ último comando). |
| M17 | `superadmin-metrics.ts:15-18` | `percentile` usa `Math.floor((n-1)·p)` sin interpolar → con `n` chico el p95 colapsa al p50; las latencias GOES se ven mejores de lo que son. | Interpolar lineal con `n` chico; ya se muestra `n` (ayuda). |
| M18 | `satellites.ts:266-313` | Cobertura VIIRS por distancia ciudad→sub-satellite-point (<1520 km) **ignora la geometría real del swath**: con paso de 60s el track se mueve ~420 km/min → ~210 km de error; puede marcar cobertura cuando la ciudad quedó fuera del swath lateral. | Usar distancia perpendicular al segmento (cross-track; `pointToSegmentDistanceKm` ya existe). |
| M19 | `src/components/support/SupportWidget.tsx` | **344 líneas sin trackear en git y sin importar en ningún lado** — feature a medio cablear / muerta. | Cablearla o borrarla; no dejarla a medias. |
| M20 | `next.config.ts` | **Sin Content-Security-Policy** (sí HSTS/X-Frame/X-Content-Type/Referrer/Permissions). `interest-cohort=()` ya está deprecado (FLoC muerto). | Agregar CSP (al menos `default-src` + allowlist de Leaflet/Supabase/Groq/Vercel). |
| M21 | `fire_danger/openmeteo.py:57-58` | **Sin manejo de cuota/429** de Open-Meteo (sin retry/backoff, sin sleeps entre las 35 requests / 386 puntos). Si la cuota se agota a mitad del cron, las zonas restantes quedan sin actualizar (cada una con `error`, `ok:false` global, **sin alerta a nadie**). Es la falla más probable en prod del pipeline FWI. | Retry/backoff en 429 + monitorear el flag `ok` del cron; evaluar key paga antes de publicar. |
| M22 | `scripts/fwi-validation/REPORT_PHASE3.md:26-30` | 4 zonas con correlación CEMS baja (jujuy-yungas 0.46, salta-yungas 0.65, BA-tandilia 0.68, tucumán-cumbres 0.73) + **buenos-aires-ventania sin validar**. Atribuido a heterogeneidad de altura (no defecto del motor). | Ajustar bbox al pedemonte y re-calibrar; o publicar primero solo zonas con Spearman>0.79. |
| M23 | `fire_danger/zones.py:40,113,228` | **Todos los bbox son "approximate, pending user validation"** (el propio código lo dice). Algunos son enormes y solapan biomas (`rio-negro-estepa` cubre media provincia). `findDangerZone` asigna suscriptores y `getProvinceDanger` pinta esos rectángulos. | Pasada de validación de bboxes con vos antes de publicar (ver §4). |

---

### 3.4 ⚪ Bajos (higiene, deuda, edge-cases)

**Higiene de repo / config (verificación directa):**
- **B1** — **23 archivos AppleDouble `._*` trackeados en git** (incl. `._.git`, `._.gitignore`, `._node_modules`, `._src`, `src/app/._layout.tsx`, `src/app/._page.tsx`, `src/app/._globals.css`, `public/._*.svg`). Son basura de macOS commiteada *pese a que `.gitignore` ya tiene `._*`* (se agregaron antes de la regla; gitignore no destrackea). Fix: `git rm --cached` de todos los `._*`.
- **B2** — `.gitignore` no ignora `__pycache__/`, `*.pyc` ni `.playwright-mcp/` → aparecen como untracked. Fix: agregarlos.

**Rate-limit / red:**
- **B3** `ratelimit.ts:105` off-by-one (permite el N-ésimo con `<=`). Cosmético.
- **B4** `ratelimit.ts:46` fail-open + fallback in-memory per-instancia → sin `UPSTASH_*` el límite es decorativo (evadible entre lambdas frías). **Confirmar env en prod.**
- **B5** `ratelimit.ts:154` `clientIp` toma `x-forwarded-for[0]` (spoofeable). Usar `x-vercel-forwarded-for`/last hop.
- **B6** `cuarteles/request/route.ts:83` el rate-limit corre *después* de la validación → bodies inválidos no tocan el limiter. Mover arriba.

**Consistencia / docs / cosméticos:**
- **B7** Cálculo de hora ART ad-hoc y distinto entre rutas (`bot:250` vs `prevention-alerts:15`). Centralizar `argentinaNow()`/`artToday()`.
- **B8** `dispersion.ts:96` ETA hardcodeada a `999` con viento en calma → se filtra a la UI. Representar como "sin dispersión"/null.
- **B9** `satellites.ts:38` comentario dice swath 3060 km, constante implica 3040 km.
- **B10** `superadmin-metrics.ts:198` `getGoesFunnelTrend` agrupa por `slice(5)` (MM-DD) → colisión latente si `daysBack>365`.
- **B11** `metrics.ts:108-115` confirmadas/descartadas se filtran por ventana de `preliminary_sent_at` → sesgo de borde en el gráfico de 7 días.
- **B12** `air-quality.ts:5-6` el rótulo "WHO 24h average" es impreciso para O3 (es 8h/peak-season) y CO. Solo etiquetado.
- **B13** Comentarios "Netlify" heredados en `supabase.ts:5` y `forest-zones-geo.ts:21` (el stack es Vercel). Código muerto de comentario.
- **B14** `forest-zones-geo.ts:16` dice "6 polígonos / ~170 KB" pero importa y registra 7. Doc desactualizada.
- **B15** CLAUDE.md describe `fire_danger.computed_at` como timestamp; es `date` (`whi-fwi-schema.sql:32`).
- **B16** `city/city-map.tsx:245` la card "Focos" no muestra estado vacío (solo aparece si `fireCount>0`); leve inconsistencia con `CityForestFires`.
- **B17** `nav.tsx:122` / `globals.css:181` el botón de menú mobile depende de `display:!important` global; frágil ante refactor de breakpoints.
- **B18** `air-dashboard.tsx:36` `top:57` hardcodeado para la barra sticky no coincide con la altura real del nav en mobile (`py-2.5` vs `md:py-3.5`). Usar `var(--nav-h)`.
- **B19** `fire-history-dashboard.tsx:27-47` doble/triple fetch a `/api/fires/history` al montar (dashboard pide `data` que el chart vuelve a pedir).
- **B20** `city-satellite-coverage.tsx:80-85` cleanup async del interval con ventana corta de interval huérfano en navegación rápida.
- **B21** `aggregate.py:26` el p95 zonal sobre-reporta en zonas heterogéneas de bosque (intencional/documentado; el número que ve la gente es el "peor sector"). Considerar split o etiquetar.
- **B22** `danger_thresholds.json`: 4 zonas húmedas (tdf-sur-bosque, sta-cruz-bosque-andino, rio-negro-bosque-andino, misiones-plantaciones) quedaron en `GLOBAL_FLOOR` puro → usan breakpoints genéricos, no calibración local. Documentar al comunicar "calibrado por zona".

---

### 3.5 ✅ Verificado correcto (para evitar falsos positivos)

- **`cron-auth.ts`** — `timingSafeEqual`, fail-closed sin `CRON_SECRET`, comparación por largo. Sólido.
- **`middleware.ts`** — allowlist + `signOut` para no-allowlisted, scoping a `/dashboard/*`, fail-closed. Sin bypass.
- **Patrón "INSERT como lock"** en `/api/alerts` y `/api/goes-alerts` (manejo de `23505`) — resuelve bien la race de dedup multi-cron.
- **`consume_fireman_code`** movido a RPC atómica — resuelve el TOCTTOU del canje de códigos.
- **Filtro forestal por rol** — implementado consistentemente en ambas rutas; coincide con CLAUDE.md (la excepción es M7, un riesgo futuro, no un bug actual).
- **`findPendingPreliminary`** scopeado por `chat_id` — no hay fuga de preliminares entre suscriptores.
- **`satellite.js` fijado en `^5.0.0`** (instalado 5.0.0) — correcto; manejo de TLEs viejos (>7 días) consistente en las 5 funciones.
- **Webhook nunca tira 500** (callbacks en try/catch con `answerCallbackQuery` best-effort) — evita reintentos de Telegram. (Salvo M2, el `request.json()` inicial.)
- **Hydration safety** en `HeroRefreshFlash` y pureza React 19 en `CitySatelliteCoverage` — bien resueltos.
- **`logger.ts` (Sentry)** — envelope y parseo de DSN correctos, best-effort no rompe el handler.
- **Counts de la landing** ("24 provincias", "78 ciudades") coinciden con `argentina-cities.ts`.

---

## 4. Revisión de la estructura FWI / provincias-biomas (se mantiene inaccesible)

> **Decisión respetada:** no se publicó nada. Esta sección documenta el estado para cuando se decida exponerlo.

### 4.1 Estado general
El motor FWI está **científicamente correcto y validado**, y la estructura es **internamente impecable**. El núcleo no necesita trabajo; lo que falta es operativo, de calibración en montaña, y de decisión de producto.

**Correctitud científica (verificada):**
- Reproduce el vector de referencia canónico de CFFDRS (Van Wagner & Pickett) al centésimo: FFMC 87.69, DMC 8.55, DC 19.01, ISI 10.85, BUI 8.49, FWI 10.10.
- Corrección de hemisferio sur (shift de 6 meses en daylength) correcta.
- Spin-up histórico de 30 días sólido.
- Validación externa contra CEMS reanalysis: Spearman **0.79–0.96** en zonas de estepa/llanura (las de peligro real, incl. la región de mayor riesgo del país: Santiago/Chaco/Formosa).
- **42/42 tests Python verdes.**

**Consistencia estructural (verificada): cero huérfanos.**
35 zonas en `zones.py` ↔ 35 grids JSON ↔ 35 entradas en `danger_thresholds.json` ↔ 23 provincias en `PREVENTION_PROVINCE_IDS` (TS). Todos los umbrales estrictamente monótonos. `province-map.tsx` solo pinta zonas que el backend calcula (`danger_zones`). No hay nada renderizado sin cálculo ni viceversa. Todo committeado en main.

### 4.2 Ocultamiento (verificado, sin fugas)
Triple capa, consistente:
- `provincia/[id]/page.tsx:30` → `robots: { index:false, follow:false }` + `dynamicParams=false`.
- `robots.ts:14` → `disallow: ["/provincia/"]`.
- `notFound()` si el id no está en `PREVENTION_PROVINCE_IDS`.
- **Cero links internos** a `/provincia` desde nav, footer, sitemap, landing, ciudad o mapa.

**Matiz importante:** "privado" aquí significa **invisible a buscadores y sin links**, NO **inaccesible**. Las 23 páginas se pre-construyen (`generateStaticParams`) y son **alcanzables por URL directa** (`/provincia/cordoba`), sin gate de auth. Para un soft-launch oculto es el patrón estándar y correcto. Si se quisiera bloqueo real, habría que gatear en `middleware.ts` como `/dashboard`.

> ⚠️ El **bot de Telegram sí expone prevención** (alertas FWI + comando `/prevencion`/`/preferencias`) — eso ya está vivo en producción. La parte oculta es solo la **web** `/provincia`.

### 4.3 Qué falta para publicar (checklist)
1. **Validar los bboxes con vos** (el código lo pide en las 3 fases) — sobre todo las cajas grandes que solapan biomas.
2. **Clampear inputs en `fwi.py`** (`wind`, `rh`, `temp`) → ninguna zona crashea por un dato espurio (A10).
3. **Resolver la cuota Open-Meteo**: retry/backoff en 429 + monitoreo del flag `ok` del cron diario (M21).
4. **Re-calibrar o diferir las 4 zonas de Yungas/alta sierra** y validar buenos-aires-ventania contra CEMS (M22).
5. **Decidir el modelo de "privado"**: noindex (ya está) vs. bloqueo real (middleware).
6. **Comunicar honestamente** que 4 zonas húmedas usan breakpoints genéricos (B22) y que el número zonal es el "peor sector" (p95) en zonas heterogéneas (B21).
7. **Medir un run real del cron** con varias zonas reseedeando spin-up a la vez (timeout 290s vs. 300s de Vercel; 35 zonas secuenciales podrían acercarse).

---

## 5. Plan de remediación priorizado

> Regla del repo: rama feature, un commit = una cosa, no commitear a `main` sin pedido. Todo lo de abajo es **propuesta**, nada aplicado.

**Tanda 0 — Confirmaciones de entorno (sin código):** verificar en Vercel que `TELEGRAM_WEBHOOK_SECRET` y `UPSTASH_REDIS_*` estén seteados (afecta M1, B4).

**Tanda 1 — Crítico/Alto que rompe entrega (esta semana):**
1. **C1** — `sendMessage` detecta/lanza errores (desbloquea A2/A4/M9). *Prerrequisito.*
2. **A1** — paginar `subscribers` (o como mínimo alertar a 1000). *Bomba de tiempo.*
3. **A2** — escapar `city_name`/`cuartel_name`/`zoneName` en HTML.
4. **A4** — briefing diario: claim después del send.
5. **A3** — timeouts en todos los fetch externos + cachear viento por foco.
6. **A10** — clampear `wind`/`rh`/`temp` en `fwi.py`.

**Tanda 2 — Alto visible al usuario + métricas de negocio:**
7. **A6/A7** — `FireCounter` SSR + hidratación `LiveCityGrid`.
8. **C2/A9** — arreglar "Top provincias" (persistir `admin1`) y la curva de crecimiento.
9. **A5** — `/ciudad` sin argumento.

**Tanda 3 — Medios (robustez, abuso, a11y):** M2, M3, M4, M5, M10, M11, M14, M20 + limpiar M12/M19.

**Tanda 4 — Higiene y deuda:** B1 (`git rm --cached ._*`), B2 (gitignore), B7 (helper ART), y el resto de bajos.

**Tanda 5 — Pre-publicación FWI** (solo si se decide exponer `/provincia`): el checklist de §4.3.

---

## 6. 10 funcionalidades propuestas (prevención, factibles, medibles, sin presupuesto extra)

> Criterios aplicados a todas: **(1)** foco en prevención (evitar igniciones, detectar antes, avisar al que corresponde antes, o sostener la confianza para que la gente actúe); **(2)** no triviales; **(3)** construibles con lo que ya tenemos (FWI, GOES-19, FIRMS, Open-Meteo, OpenWeather, Telegram, Supabase, Groq, `satellite.js`, pluma gaussiana) — **sin nuevas fuentes pagas ni infra**; **(4)** con una métrica de éxito concreta.
>
> Marco de esfuerzo: **S** = pocos días · **M** = 1–2 semanas · **L** = 2–4 semanas.

### F1 — "¿Hoy se puede quemar?" — semáforo de ventana de quema rural · **M**
**Problema de prevención:** una gran parte de los incendios arranca de **quemas de pastizal/rastrojo que se escapan**. Atacarlo en la fuente de ignición es la prevención más costo-efectiva.
**Qué es:** comando `/quema` y página que, para la zona del usuario, responde un go/no-go honesto ("Hoy NO conviene quemar: peligro ALTO, viento 35 km/h, humedad 18%") usando el FWI + viento + humedad que **ya calculamos**.
**Construcción:** reusa el motor FWI (DC/ISI/clase) + Open-Meteo. Es exponer al ciudadano rural una vista de lo que ya existe, con copy de decisión.
**Métrica:** nº de consultas `/quema`/semana; nº de suscriptores en zonas rurales; (proxy) correlación con reportes de escapes en temporada.

### F2 — Reporte ciudadano de humo georreferenciado con verificación cruzada satelital · **M**
**Problema:** entre pasada y pasada satelital hay huecos; el ciudadano a veces ve el humo **antes** que el satélite.
**Qué es:** el usuario manda ubicación (+ foto opcional) por el bot → se crea un pin → se cruza con GOES preliminar + FIRMS en radio/tiempo. Si matchea, sube la confianza; si no, queda en cola para revisión. Detección temprana crowdsourced que complementa los satélites.
**Construcción:** Telegram (ya recibe ubicación) + nueva tabla Supabase + el clasificador forestal y el matcher de cercanía que ya existen.
**Métrica:** nº de reportes; **% que precede a la confirmación satelital**; mediana de minutos de adelanto ganados.

### F3 — Pre-alerta a poblaciones a sotavento (humo) usando la pluma que ya existe · **M** *(depende de A8)*
**Problema:** ante un incendio confirmado, las poblaciones **a favor del viento** reciben humo peligroso para asmáticos, niños y mayores, a veces sin saberlo.
**Qué es:** cuando se confirma un foco (FIRMS/GOES), se computa el cono de humo (`dispersion.ts`, ya existe) + pronóstico de viento, y se **pre-avisa** a los suscriptores de las ciudades a sotavento ("Posible humo en ~2 h por incendio a 18 km; si tenés asma, cerrá ventanas").
**Construcción:** reusa pluma gaussiana + viento + suscriptores. **Requiere arreglar A8 primero.**
**Métrica:** nº de pre-alertas a sotavento; tiempo de adelanto vs. deterioro real del aire (lo medimos con Open-Meteo Air Quality que ya consumimos).

### F4 — Briefing matinal operativo para cuarteles (rol fireman) · **S–M**
**Problema:** la prevención también es **preparación**: los cuarteles necesitan saber al amanecer cómo viene el día.
**Qué es:** digest diario 06:00 ART por zona de cuartel: clase FWI + tendencia, focos activos en X km, pronóstico de viento/humedad, riesgo de tormenta seca. Apunta a pre-posicionamiento.
**Construcción:** reusa FWI + FIRMS + lightning + el rol `fireman` y el cron de prevención que ya existen.
**Métrica:** open/click rate del briefing; nº de cuarteles suscriptos; retención a 30/90 días.

### F5 — Pronóstico de tormenta seca (dry lightning) a 24–48 h, no solo detección · **M**
**Problema:** el rayo seco es una de las **principales fuentes de ignición natural** (Patagonia, sierras). Hoy `lightning-alerts` solo *detecta*.
**Qué es:** estimar el **riesgo** de tormenta seca a 24–48 h combinando señales de Open-Meteo (CAPE/convección + precipitación baja + humedad baja). Permite pre-posicionar antes de que caiga el rayo.
**Construcción:** Open-Meteo Forecast (ya lo usamos) + reglas; reusa el canal de alertas.
**Métrica:** nº de alertas de pronóstico; **hit rate** vs. rayos efectivamente detectados al día siguiente (lo sabemos por la fuente de detección que ya tenemos).

### F6 — Indicador de sequía estacional visible ("qué tan seco viene el monte") · **S–M**
**Problema:** el peligro se **construye semanas antes** de cualquier chispa; el Drought Code lo captura pero hoy está oculto.
**Qué es:** exponer la tendencia del DC por zona como un medidor regional de sequedad, y avisar cuando cruza su percentil estacional. Comunica el riesgo de fondo con semanas de anticipación.
**Construcción:** reusa el DC del FWI (ya calculado). Puede mostrarse como **indicador regional de sequedad** de forma segura incluso antes del lanzamiento completo de `/provincia` (es un número de contexto, no la página completa).
**Métrica:** vistas del indicador; nº de alertas de "cruce de percentil"; retención.

### F7 — Páginas + mensajes por nivel del semáforo con instructivos de prevención · **S–M**
**Problema:** una alerta sin **qué hacer** no cambia conductas. (Ya identificado como sub-proyecto pendiente.)
**Qué es:** una página por nivel (bajo → extremo) con instrucciones concretas (no usar fuego, no maquinaria que chispee, plan de evacuación), y ese material enlazado/resumido en **cada** alerta de Telegram.
**Construcción:** contenido + routing que ya existe; un link por alerta.
**Métrica:** **CTR del link** desde las alertas; tiempo en página; (proxy) cambio en la tasa de respuesta a alertas posteriores.

### F8 — Suscripción por área dibujada (campo/reserva) en vez de un solo punto · **L**
**Problema:** un productor, una reserva o un cuartel cubre un **área**, no un punto; un único lat/lng pierde precisión.
**Qué es:** permitir definir un polígono propio y recibir FWI agregado + focos dentro del área + riesgo de humo. Mejor targeting que el punto único.
**Construcción:** reusa el point-in-polygon de `forest-zones-geo.ts` + Supabase; UI de dibujo sobre el Leaflet que ya tenemos.
**Métrica:** nº de áreas definidas; alertas disparadas por área; retención de usuarios "pro" (productores/cuarteles).

### F9 — Panel público de transparencia/precisión ("qué tan bien detectamos") · **M**
**Problema:** la adopción (y con ella el alcance preventivo) depende de la **confianza**; la confianza se gana mostrando aciertos.
**Qué es:** panel con backtest del FWI vs. focos reales, tasa de confirmación GOES↔FIRMS y tasa de falsas alarmas. Doble función: marketing de credibilidad **y** operacionalizar la reducción de fatiga de alerta.
**Construcción:** reusa datos que **ya recolectamos** (`goes_sync_runs`, `fires_daily_history`, `goes_alerted`). Es agregación + visualización (Recharts ya está).
**Métrica:** tasa de falsos positivos (tendencia a la baja); tasa de confirmación; vistas del panel.

### F10 — Reducción de fatiga de alerta: relevancia + digest configurable · **M**
**Problema:** demasiadas notificaciones → la gente **silencia o bloquea** el bot, y entonces se pierde la alerta que sí importaba. La fatiga es, en sí misma, una **falla de prevención**.
**Qué es:** que cada suscriptor elija "tiempo real" vs. "resumen", y rankear las alertas por relevancia (cercanía, clase FWI, si está a sotavento, si es zona forestal) para no notificar lo irrelevante.
**Construcción:** reusa el filtro por rol, los botones de feedback y el menú de preferencias que ya existen; suma un score y un modo digest.
**Métrica:** tasa de bloqueo/opt-out (a la baja); **tasa alerta → acción** (clicks en los botones de feedback que ya tenemos).

### Tabla resumen de features

| # | Feature | Eje de prevención | Esfuerzo | Reusa | Depende de |
|---|---|---|---|---|---|
| F1 | ¿Hoy se puede quemar? | Evitar ignición | M | FWI, Open-Meteo | — |
| F2 | Reporte ciudadano de humo | Detectar antes | M | Telegram, GOES/FIRMS | — |
| F3 | Pre-alerta a sotavento | Avisar antes al que corresponde | M | Pluma, viento, subs | **A8** |
| F4 | Briefing matinal cuarteles | Preparación | S–M | FWI, FIRMS, rol fireman | — |
| F5 | Pronóstico de tormenta seca | Evitar/anticipar ignición natural | M | Open-Meteo | — |
| F6 | Sequedad estacional (DC) | Riesgo de fondo anticipado | S–M | FWI (DC) | — |
| F7 | Niveles + instructivos | Cambio de conducta | S–M | Routing, alertas | — |
| F8 | Suscripción por área | Targeting | L | Point-in-polygon, Leaflet | — |
| F9 | Panel de transparencia | Confianza → adopción | M | Datos ya recolectados | — |
| F10 | Anti-fatiga de alerta | No perder la alerta que importa | M | Rol, feedback, preferencias | — |

---

## 7. Cierre

- **Lo más urgente:** C1 (`sendMessage` ciego a errores) y A1 (cap de 1.000 suscriptores). Ambos silenciosos, ambos atacan la función central. C1 es además prerrequisito para que el resto de la lógica de entrega funcione como está diseñada.
- **El motor FWI no necesita trabajo de fondo** — está validado contra la referencia canónica y contra CEMS. La estructura de provincias está impecablemente ordenada y bien oculta. Lo que falta para publicarla es operativo y de calibración en montaña (§4.3), no de correctitud.
- **Las 10 features** se apoyan en datos/infra que ya pagamos $0 y son medibles. F3, F6 y F8 capitalizan directamente el motor FWI ya construido.

> Documento generado el 2026-06-30. La auditoría (§1–§4) fue read-only. Las remediaciones se implementaron después en la rama `fix/audit-2026-06-30` (ver §9). Las 10 features siguen siendo propuestas pendientes de tu OK.

---

## 8. Desarrollo de las 10 propuestas (para elegir)

> Resumen decisorio de 2–3 líneas por feature: qué desbloquea, por qué conviene, y mi recomendación para elegir. El detalle completo está en §6.

**F1 — ¿Hoy se puede quemar?**
Es la única feature que ataca la **causa** (la quema rural que se escapa), no la consecuencia. Reusa el FWI que ya calculamos, así que el costo real es el copy de decisión y un comando. **Elegir si** querés impacto preventivo aguas arriba con esfuerzo medio → *candidata a primer lanzamiento junto con F7*.

**F2 — Reporte ciudadano de humo**
Convierte a cada suscriptor en un sensor y te da algo que ningún satélite te da: detección en los huecos entre pasadas. Es además el mayor generador de *engagement* y de datos propios. **Elegir si** el foco es crecer la red y diferenciarte; ojo que requiere un mínimo de moderación/anti-spam.

**F3 — Pre-alerta a sotavento**
Aprovecha la pluma gaussiana que **ya está construida** para avisar a quienes van a recibir humo (asmáticos, chicos, mayores). Alto valor sanitario y percibido. **Elegir si** aceptás arreglar primero el bug A8 de dispersión (ya corregido en esta rama) → queda lista para construir encima.

**F4 — Briefing matinal para cuarteles**
Es la feature con **mejor calce comercial**: le da a los cuarteles (tu canal de go-to-market) una razón diaria para abrir el bot. Bajo esfuerzo, reusa todo. **Elegir si** priorizás retención y venta institucional → *mejor relación impacto/esfuerzo del listado*.

**F5 — Pronóstico de tormenta seca**
Pasa de "avisar cuando cae el rayo" a "avisar el día antes", que es donde está la prevención real en Patagonia/sierras. Reusa Open-Meteo. **Elegir si** querés fortalecer el pilar de ignición natural; su hit-rate es fácil de medir y comunicar.

**F6 — Sequedad estacional (Drought Code)**
El dato de riesgo de fondo (semanas de anticipación) que ya calculamos pero está enterrado. Es lo **más barato de sacar** y se puede publicar como indicador regional sin abrir todo `/provincia`. **Elegir si** querés una victoria rápida y visible → *quick-win*.

**F7 — Niveles del semáforo con instructivos**
Sin "qué hacer", una alerta no cambia conductas; esto cierra ese hueco y ya lo tenías anotado como pendiente. Contenido + un link por alerta. **Elegir si** querés que las alertas actuales rindan más → *quick-win, combinable con F1*.

**F8 — Suscripción por área dibujada**
El salto de "punto" a "área" es lo que hace útil el producto para productores, reservas y cuarteles (targeting real). Es la de **mayor esfuerzo (L)** y la más "producto". **Elegir si** vas a monetizar el segmento pro/institucional y querés una feature de pago diferencial.

**F9 — Panel de transparencia**
Convierte los datos que ya guardás en prueba de que el sistema funciona → confianza → adopción → alcance preventivo. Doble uso marketing + operativo. **Elegir si** el cuello de botella hoy es credibilidad/tracción (hoy hay casi 0 usuarios).

**F10 — Anti-fatiga de alerta**
La fatiga es una falla de prevención encubierta: si silencian el bot, se pierde la alerta que importaba. Reusa preferencias + feedback existentes. **Elegir si** ya tenés volumen de alertas; con pocos usuarios hoy es menos urgente que F4/F6/F7.

### Recomendación de secuencia (impacto/esfuerzo)
1. **Quick-wins primero:** F6 (sequedad, casi gratis) + F7 (instructivos) + F1 (ventana de quema) — poco esfuerzo, prevención directa, sin abrir `/provincia`.
2. **Motor de adopción:** F4 (briefing cuarteles) — apalanca tu go-to-market.
3. **Diferenciación:** F3 (pre-alerta a sotavento) y F5 (pronóstico de rayo) — valor sanitario y de ignición.
4. **Estratégicas/más grandes:** F2 (crowdsourcing), F9 (transparencia), F10 (anti-fatiga), F8 (áreas, la más grande).
