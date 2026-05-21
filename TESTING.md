# Cómo testear lo hecho hoy (2026-05-11)

Esta guía cubre todo lo que se desplegó hoy:
- WHI-545 Pipeline GOES-19 (production)
- WHI-546 v1 filtros + v2 persistencia temporal
- WHI-547 Alertas preliminares GOES + confirmación FIRMS
- Landing: data sources actualizados + métrica "Preliminares 24h"
- RLS habilitado en 8 tablas
- WHI-581 (manual — pendiente acción del owner)

## 0. Verificación rápida visual (2 min)

```
1. Abrí https://alertaforestal.org
2. Scrollá a "Cómo funciona" → paso 02 menciona GOES-19 + FIRMS
3. Scrollá a "Fuentes de datos" → aparece NOAA GOES-19 con icon de satélite
4. Tira de métricas → "Preliminares 24h" en la cuarta tarjeta
5. Footer → columna Datos incluye link a NOAA GOES-19
```

Si las 5 cosas se ven, el deploy de WHI-547 está vivo.

## 1. Pipeline GOES productivo (WHI-545)

### 1.1 — Disparar manualmente el cron

Vía Supabase SQL Editor (necesita CRON_SECRET — está en Vercel env):

```sql
SELECT net.http_get(
  'https://alertaforestal.org/api/goes-sync?secret=<CRON_SECRET>',
  timeout_milliseconds := 60000
) AS request_id;
```

Devuelve un `request_id`. Esperá ~10 segundos y consultá:

```sql
SELECT id, status_code, LEFT(content::text, 600) AS body, created
FROM net._http_response
WHERE id = <request_id_devuelto>;
```

**Lo que esperás ver:**
```json
{
  "ok": true,
  "error": null,
  "scan_start": "2026-05-11T13:30:21.8Z",
  "s3_key": "ABI-L2-FDCF/2026/131/13/OR_ABI-L2-FDCF-M6_G19_*.nc",
  "detections_kept": 0,   // o N si hay fuegos en ARG
  "inserted": 0,          // mismo N
  "persistent": 0,        // cuántos tienen seen_in_scans >= 2
  "timing_seconds": {"download": 0.07, "process": 2.1, "total": 2.39}
}
```

### 1.2 — Ver el job pg_cron programado

```sql
SELECT jobid, jobname, schedule, command FROM cron.job
WHERE jobname IN ('goes-sync', 'goes-alerts')
ORDER BY jobname;
```

Esperás:
- `goes-sync` schedule `5,15,25,35,45,55 * * * *`
- `goes-alerts` schedule `7,17,27,37,47,57 * * * *`

### 1.3 — Ver últimas corridas y resultado HTTP

```sql
SELECT j.jobname, r.start_time, r.status, LEFT(r.return_message, 200) AS msg
FROM cron.job j
JOIN cron.job_run_details r ON r.jobid = j.jobid
WHERE j.jobname IN ('goes-sync', 'goes-alerts')
ORDER BY r.start_time DESC
LIMIT 20;
```

## 2. Filtros v1 + v2 (WHI-546)

### 2.1 — Re-correr el spike local con filtros sobre data histórica

```bash
cd scripts/goes-spike
source venv/bin/activate
python evaluate.py
```

Salida esperada (puede variar levemente por nuevos scans):
```
scan_time (UTC)         global  arg_raw →  mask  poly  urban  dedup   kept%
2026-05-11 13:30:21        104        2 →     1     1      1      1     50%
2025-11-15 18:50:20        920       13 →     5     2      1      1      8%
...
```

CSV de focos sobrevivientes en `out/evaluation_<timestamp>_survivors.csv`.

### 2.2 — Verificar v2 columna persistence

```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE seen_in_scans >= 2) AS persistent,
  max(seen_in_scans) AS max_scans
FROM goes_preliminary
WHERE detected_at >= now() - interval '24 hours';
```

En temporada baja (mayo) el conteo va a ser 0. Cuando arranque temporada (oct-mar)
el campo `seen_in_scans` se va a llenar para focos reales.

## 3. Alertas preliminares + confirmación (WHI-547)

### 3.1 — Trigger manual del endpoint

```sql
SELECT net.http_get(
  'https://alertaforestal.org/api/goes-alerts?secret=<CRON_SECRET>',
  timeout_milliseconds := 60000
);
```

Respuesta esperada (sin focos en goes_preliminary):
```json
{"processed": 0, "alerts": 0, "reason": "no_recent_detections"}
```

### 3.2 — Simular un foco para testear la lógica end-to-end (avanzado)

Si querés ver una alerta preliminar real en Telegram **antes** que la temporada
empiece, podés inyectar un foco de prueba:

```sql
-- Inyectar foco a 50 km de un subscriber existente (ajustá lat/lng al tuyo)
INSERT INTO goes_preliminary (lat, lng, mask, mask_label, frp_mw, scan_start, high_confidence, detected_at, seen_in_scans)
VALUES (
  -38.5, -70.0,   -- cambia a algo ~50km de tu ubicación de subscriber
  30, 'tf_fire_good_quality',
  25.0,
  now(),
  true,
  now(),
  2
);
```

Luego disparar `/api/goes-alerts` (paso 3.1). Deberías recibir la alerta
preliminar en Telegram. Borrá la fila después:

```sql
DELETE FROM goes_preliminary WHERE mask_label LIKE '%fire_good_quality%'
  AND detected_at > now() - interval '1 hour'
  AND frp_mw = 25.0;
```

### 3.3 — Inspeccionar tabla de alertas enviadas

```sql
SELECT ga.id, ga.chat_id, ga.preliminary_sent_at, ga.confirmed_sent_at, ga.firms_fire_key,
       gp.lat, gp.lng, gp.mask_label
FROM goes_alerted ga
JOIN goes_preliminary gp ON gp.id = ga.goes_id
ORDER BY ga.preliminary_sent_at DESC
LIMIT 20;
```

Si `confirmed_sent_at` es NULL → preliminar sin confirmar todavía. Si tiene
fecha + `firms_fire_key` → FIRMS validó la detección preliminar y se mandó
el mensaje "CONFIRMADO".

## 4. RLS (security)

### 4.1 — Verificar que RLS quedó habilitado

```sql
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'subscribers', 'ai_alerted_fires', 'fires_cache', '_fires_sync_state',
  'fires_daily_history', 'lightning_alerted', 'goes_preliminary', 'goes_alerted'
)
ORDER BY relname;
```

Las 8 tablas deben dar `rls_enabled = true`.

### 4.2 — Verificar que nada se rompió

- Visitá https://alertaforestal.org → si las "Incendios 24h" muestran
  números, los reads desde el service role funcionan.
- Mandá `/estado` al bot → si responde con focos, los queries del bot funcionan.
- Trigger manual de `/api/goes-sync` (paso 1.1) → si inserta, los writes
  funcionan.

Si algo se rompe, hay que agregar policies. Probablemente no haga falta
porque toda la app usa service_role.

## 5. Bot Telegram nuevo (WHI-581) — MANUAL, no automatizado

Pasos detallados en `scripts/WHI-581-bot-rotation.md`. Resumen:

1. Actualizar `TELEGRAM_BOT_TOKEN` en Vercel env vars (Production + Preview + Dev)
2. Redeploy production
3. `curl -F "url=https://alertaforestal.org/api/bot/telegram" https://api.telegram.org/bot<NEW_TOKEN>/setWebhook`
4. Mandar `/start` al bot nuevo → si responde, listo
5. Revocar el bot viejo en @BotFather (`/mybots` → bot viejo → Revoke)

## 6. Spike local — desde cero (opcional, validación independiente)

Si querés correr el spike Python desde tu mac:

```bash
cd scripts/goes-spike
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python spike.py                        # último frame
python spike.py --at 2025-11-15T18:00  # frame de peak season
python evaluate.py                     # filtros sobre 4 scans
```

Output en `out/`. Tiempos esperados:
- `spike.py`: ~3s (descarga + parse)
- `evaluate.py`: ~12s (4 scans secuenciales)

## Tabla resumen — qué SQL pegar para qué pregunta

| Pregunta | SQL |
|---|---|
| ¿Anda el pipeline GOES? | `SELECT * FROM net._http_response WHERE created > now() - interval '1 hour' ORDER BY created DESC LIMIT 5;` |
| ¿Hay focos en Argentina? | `SELECT count(*), max(detected_at) FROM goes_preliminary WHERE detected_at > now() - interval '24 hours';` |
| ¿Cuántos preliminares se persistieron? | `SELECT count(*) FROM goes_preliminary WHERE seen_in_scans >= 2;` |
| ¿A quién alertamos hoy? | `SELECT chat_id, count(*) FROM goes_alerted WHERE preliminary_sent_at > now() - interval '24 hours' GROUP BY chat_id;` |
| ¿Cuántos cron jobs hay? | `SELECT jobname, schedule FROM cron.job ORDER BY jobname;` |
| ¿RLS está bien? | `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('goes_preliminary', 'goes_alerted', 'subscribers');` |
