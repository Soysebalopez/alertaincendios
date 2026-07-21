# FIRMS MAP_KEY — detección de invalidez + rotación semi-automática

**Fecha:** 2026-07-21
**Estado:** aprobado (diseño validado en conversación con Seba)
**Rama:** `feat/firms-mapkey-guard`

> **Nota de revisión final (post-rotation race):** la revisión final de la rama detectó que
> `/rotarkey` borrando `firms_key_alerted_at` (además de `firms_sync_error`) abría dos races
> de alertas espurias post-rotación. El diseño en §3 paso 5, la tabla de flags en §4 y el
> manejo de errores de red se actualizaron para reflejar el comportamiento corregido:
> `/rotarkey` borra solo `firms_sync_error`, deja `firms_key_alerted_at` exclusivamente al
> recovery del monitor, y pre-arma `fires_freshness_alerted_at` condicionalmente.

## Problema

Incidente recurrente (~cada 28 días: 2026-06-19 y 2026-07-17). NASA invalida la MAP_KEY de
FIRMS y responde el texto `Invalid MAP_KEY.` con **HTTP 200**. La cadena de falla:

1. `fires_sync_step1_fetch()` pide el CSV con la key muerta; pg_net guarda el body de error.
2. `fires_sync_step2_process()` ve `status_code = 200`, parsea el body como CSV → 0 filas →
   **reemplaza** `fires_cache` con `[]` (semántica WHI-378). Cada ciclo de 15 min borra los focos.
3. El monitor `/api/monitor/fires-freshness` mira solo `fetched_at`, que el cron actualiza
   igual → cache "fresco pero vacío" → nunca alerta.
4. Resultado: landing "sin focos", mapa vacío, durante días, en silencio (6 días en julio).

Verificado contra NASA (2026-07-21):

- Endpoint de datos con key inválida → body literal `Invalid MAP_KEY.` (HTTP 200).
- `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=<key>` → con key
  inválida devuelve texto de error ("MAP_KEY is invalid or you have exceeded your
  transaction/time limit…"); con key válida devuelve JSON de transacciones.
- **No existe API oficial para generar/regenerar la key**: es un form web (JS) atado a un
  email; la key llega por mail. Full-auto descartado (frágil, probable violación de ToS).

## Objetivo

1. **Detección específica en minutos**: cuando la key muera, aviso por Telegram al admin
   diciendo exactamente qué pasó y qué hacer.
2. **Sin pérdida de datos**: el landing sigue mostrando los últimos focos buenos mientras
   la key esté muerta — nunca más "0 focos" falso.
3. **Rotación semi-automática**: pedir la key nueva sigue siendo manual (form de NASA), pero
   aplicarla es un mensaje de Telegram: `/rotarkey <key>`.

**No-objetivos:** automatizar el form de NASA; leer el mail; tocar la cadencia de crons;
resolver la causa raíz del lado NASA (queda como seguimiento).

## Diseño

### 1. Guard en SQL — `fires_sync_step2_process()` (aplicación manual)

Archivo versionado nuevo: `scripts/sql/whi-firms-body-guard.sql` (CREATE OR REPLACE de la
función completa, basada en la versión de `whi-378-fix-fires-sync-step2.sql`).

El CSV del area API de FIRMS siempre empieza con el header `latitude,longitude,…`. Guard
después del chequeo de `status_code`:

- Si `v_body IS NULL` o `v_body NOT LIKE 'latitude%'` → el body **no es CSV** (key inválida,
  rate limit, HTML de mantenimiento — cualquier modo de falla presente o futuro):
  - **No tocar `fires_cache`** (los últimos focos buenos quedan visibles).
  - Upsert en `_clara_config`: key `firms_sync_error`, value = `<ISO timestamp> | <primeros
    200 chars del body>`.
  - Limpiar `request_id` en `_fires_sync_state` y devolver `(0, 'firms_body_error')`.
- Camino feliz (body CSV, incluso con 0 filas de datos): igual que hoy, **más** un DELETE del
  flag `firms_sync_error` si existe (recovery automático).

### 2. Monitor extendido — `/api/monitor/fires-freshness`

El endpoint existente (pg_cron `fires-freshness-monitor`, cada 15 min) suma la señal de key:

- Lee de `_clara_config` dos keys más: `firms_sync_error` y `firms_key_alerted_at`
  (extiende el `.in()` actual; también `firms_map_key` para el chequeo activo).
- **Flag presente y no alertado** → confirmación activa contra `mapkey_status` con la key
  actual (mejora el mensaje; si NASA no responde, alerta igual — el flag es la señal
  primaria). Manda alerta única por Telegram al `admin_chat_id`:
  - Qué pasó (snippet del error de NASA + desde cuándo).
  - Link al form: `https://firms.modaps.eosdis.nasa.gov/api/map_key/`.
  - Instrucción: "cuando tengas la key nueva, mandá `/rotarkey <key>` acá".
  - Setea `firms_key_alerted_at` (anti-spam, mismo patrón que la alerta de frescura).
- **Flag ausente y `firms_key_alerted_at` presente** → recovery: mensaje ✅ y borra el flag
  de alerta.
- **Precedencia**: mientras `firms_sync_error` esté presente, se **suprime** la alerta
  genérica de staleness (con el guard, `fetched_at` deja de avanzar y a los 60 min
  dispararía; la causa ya se conoce y la alerta específica ya salió — no duplicar ruido).
  La lógica de decisión vive en una función pura (extensión de
  `src/lib/fires-freshness.ts`) para testearla sin I/O.

### 3. Bot — comando `/rotarkey <key>` (solo admin)

En `src/app/api/bot/telegram/route.ts`, rama nueva del dispatch:

- **Autorización**: solo si `chat_id` == `_clara_config.admin_chat_id`. Para cualquier otro
  chat se comporta como comando desconocido (sin revelar que existe).
- Flujo:
  1. Sin argumento → mensaje de uso.
  2. `.trim()` del argumento.
  3. **Validación en vivo**: fetch al area API de FIRMS con la key candidata (bbox Argentina,
     1 día). Body empieza con `latitude` → válida; cualquier otra cosa → rechazo con el
     mensaje de NASA. Una key con typo nunca llega a la DB.
  4. Upsert `_clara_config.firms_map_key` (la app ya escribe en `_clara_config` con
     service_role — sin SQL manual).
  5. DELETE de **solo** `firms_sync_error`. `firms_key_alerted_at` **no** se borra acá —
     la limpia exclusivamente la transición de recovery del monitor, una vez que
     `fires_cache` efectivamente vuelve a estar fresco (ver nota de revisión final abajo).
     Además, `/rotarkey` pre-arma **condicionalmente** `fires_freshness_alerted_at`: si
     `fires_cache.fetched_at` ya está stale (o ausente) al momento de rotar, la setea ahora
     mismo, para que el próximo sync exitoso dispare un único "✅ FIRMS se recuperó" en vez
     de una alerta genérica de staleness engañosa. Si el cache ya está fresco (rotación
     proactiva), NO la setea — evita un "recuperó" espurio sin alerta previa.
  6. `deleteMessage` del mensaje del admin (la key no queda en el historial del chat). La
     confirmación solo dice "borré tu mensaje" si `deleteMessage` efectivamente devolvió
     éxito.
  7. Respuesta: ✅ key validada y rotada, próximo sync ≤15 min, recordatorio de los 2 lugares
     secundarios (Vercel env `FIRMS_API_KEY` — solo ruta manual de sync — y
     `scripts/backfill.env` local).
- **Logging**: `logBotCommand(chatId, "/rotarkey")` **sin** el argumento — la key es un
  secreto y `bot_commands_log` no debe contenerla.
- Helper compartido: `isFirmsCsvBody(body: string)` en lib (lo usan la validación del
  comando y los tests; el guard SQL replica la misma regla en plpgsql).

### 4. Datos y config

Sin migraciones de tablas. Keys nuevas en `_clara_config`:

| Key | Escribe | Borra | Significado |
|---|---|---|---|
| `firms_sync_error` | step2 SQL (guard) | step2 SQL (recovery), `/rotarkey` | Último body no-CSV + timestamp |
| `firms_key_alerted_at` | monitor (al alertar) | **solo** monitor (recovery) | Anti-spam de la alerta de key — `/rotarkey` deliberadamente NO la toca (ver revisión final) |
| `fires_freshness_alerted_at` | monitor (al alertar), `/rotarkey` (pre-arm condicional si el cache ya está stale al rotar) | monitor (recovery) | Anti-spam de la alerta genérica de staleness |

## Manejo de errores

- NASA caída / timeout en la validación de `/rotarkey` → `validateMapKey` distingue esto
  (`reason: "network"`) de un rechazo real (`reason: "rejected"`). Responde "⚠️ No pude
  validar la key contra NASA (problema de red o NASA caída). No la guardé — probá de nuevo
  en unos minutos" — sin acusar "NASA rechazó" (sería falso: NASA nunca contestó) y sin
  filtrar el error de red crudo; **no** rotar sin validar.
- `mapkey_status` inaccesible en el monitor → alertar igual con el snippet del flag (señal
  primaria); el chequeo activo solo enriquece.
- `deleteMessage` falla (>48h, permisos) → ignorar; la rotación ya ocurrió y el chat es
  privado del admin.
- Guard SQL y monitor son independientes: si el SQL no se aplicó todavía, el monitor
  simplemente no ve el flag y todo sigue como hoy (deploy de app primero es seguro).

## Testing

- **Unit** (`vitest`, junto a los tests existentes de `fires-freshness`):
  - `isFirmsCsvBody` con fixtures reales: CSV verdadero, `Invalid MAP_KEY.`, mensaje de rate
    limit, string vacío, HTML.
  - Función de decisión del monitor: matriz {flag presente/ausente} × {alertado sí/no} ×
    {stale sí/no} → acción esperada (incl. la precedencia key-error > staleness).
- **SQL**: el archivo incluye query de verificación post-aplicación (`select
  fires_sync_step2_process()` camino feliz sigue `'ok'`; `pg_get_functiondef` contiene el
  guard).
- **E2E** (receta nueva en `TESTING.md`):
  1. Setear a mano `_clara_config.firms_sync_error` con un valor de prueba → correr el
     monitor con `?secret=` → llega la alerta específica → borrar el flag → corre recovery.
  2. `/rotarkey basura123` → rechazo con mensaje de NASA.
  3. `/rotarkey <key actual válida>` → acepta (rotación no-op), borra flags, borra el
     mensaje.

## Rollout

1. Deploy de la app (monitor + bot) — seguro sin el SQL aplicado.
2. Seba aplica `scripts/sql/whi-firms-body-guard.sql` en Supabase (SQL Editor, proyecto
   `qmzuwnilehldvobjsbcs`).
3. E2E de la receta de `TESTING.md`.
4. Registrar `/rotarkey` en el menú nativo del bot **no aplica** (comando oculto de admin —
   no va en `sync-commands`).

## Seguimiento (fuera de alcance)

- **Causa raíz**: la cadencia ~28 días sugiere expiración/purga del lado NASA (no
  documentada). Al rotar la próxima key, anotar la fecha; si muere de nuevo a ~28 días,
  escribir a soporte FIRMS preguntando por la política de expiración / key de larga vida.
  Hipótesis alternativa a descartar: re-solicitar una key con el mismo email podría
  invalidar la anterior — no pedir keys "de prueba" con el email de prod.
