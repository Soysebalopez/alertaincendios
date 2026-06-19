# Monitor de frescura FIRMS + rotación de MAP_KEY a config

**Fecha:** 2026-06-19
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** El MAP_KEY de NASA FIRMS se invalidó el 2026-06-16 y el mapa quedó congelado 3 días mostrando focos viejos, **sin que nadie se enterara**: los cron jobs reportaban "succeeded" porque solo verifican que el SQL corra, no que el dato se actualice. El monitoreo actual (Healthchecks.io + uptime) vigila cold-start/disponibilidad, no la **frescura del dato**.

---

## 1. Problema y oportunidad

La falla no fue la credencial (eso se renueva en segundos) sino que **falló en silencio**. `fires_cache` se quedó en `fetched_at = 2026-06-16` y nadie tuvo señal. Hace falta una alerta que mire el **dato**, no el cron.

Cubre cualquier causa futura de "FIRMS dejó de actualizar" (key inválida, FIRMS caído, pg_net roto), no solo la rotación de key.

## 2. Objetivos / No-objetivos

**Objetivos:**
- Avisar por **Telegram** (bot Clara) al admin cuando `fires_cache.fetched_at` supere un umbral de antigüedad.
- Avisar **una sola vez** al caer y **una vez** al recuperarse (sin spam).
- Versionar en el repo el **fix de rotación del MAP_KEY** ya aplicado en producción (MAP_KEY movido de la función SQL a `_clara_config`).

**No-objetivos:**
- Otros canales (Healthchecks/email) — se eligió Telegram; los demás quedan para después.
- Monitorear GOES u otras fuentes (GOES está sano; este monitor es específico de FIRMS).
- UI de estado en el dashboard.
- Re-avisos periódicos mientras sigue caído (solo "cayó" + "recuperó").

## 3. Decisiones del brainstorming

- **Canal:** Telegram directo al admin (bot Clara).
- **Umbral:** 60 min (el cron FIRMS corre cada 15 min → 4 ciclos perdidos; tolera un fetch fallido transitorio sin falsa alarma).
- **Anti-spam:** un aviso al cruzar a stale, un aviso al recuperarse; estado en `_clara_config`.
- **Config en `_clara_config`** (no env vars): `admin_chat_id` y el flag de estado, igual que el MAP_KEY — cambiar = `UPDATE`, sin redeploy.
- **Rama aparte** del FWI.

## 4. Arquitectura

**En una línea:** un `pg_cron` cada 15 min pega a un endpoint que compara `fires_cache.fetched_at` contra el umbral y, en las transiciones, manda Telegram al admin.

### 4.1 Lógica de decisión (función pura, testeable)
`src/lib/fires-freshness.ts` — `decideFreshnessAction({ ageMinutes, thresholdMinutes, alertedAt }) -> { action }` donde `action ∈ { "none", "alert_stale", "alert_recovered" }`:
- `ageMinutes > threshold` y `alertedAt` nulo → `alert_stale`.
- `ageMinutes <= threshold` y `alertedAt` no-nulo → `alert_recovered`.
- en otro caso → `none`.

Sin I/O — recibe los valores ya leídos. Esto concentra la lógica de transición y la hace unit-testeable.

### 4.2 Endpoint `/api/monitor/fires-freshness` (TS, App Router)
- Gated por `isCronAuthorized()` (mismo patrón que los otros crons).
- Lee `fires_cache.fetched_at` (Supabase service role) + `admin_chat_id` y `fires_freshness_alerted_at` de `_clara_config`.
- Calcula `ageMinutes`, llama `decideFreshnessAction`.
- Según `action`:
  - `alert_stale` → `sendMessage(admin_chat_id, "⚠️ FIRMS sin actualizar hace {age}. Último fetch: {ts}.")`; set `fires_freshness_alerted_at = now`.
  - `alert_recovered` → `sendMessage(admin_chat_id, "✅ FIRMS volvió a actualizar (hace {age}).")`; borra `fires_freshness_alerted_at`.
  - `none` → no hace nada.
- Si `admin_chat_id` no está configurado, no manda (degradación segura, como `sendMessage` con token ausente) y lo refleja en la respuesta.
- Responde JSON `{ ageMinutes, stale, action, notified }`.

### 4.3 `pg_cron` `fires-freshness-monitor`
- `*/15 * * * *` → `net.http_get('https://alertaincendios.vercel.app/api/monitor/fires-freshness?secret=' || clara_cron_secret())`.
- SQL versionado en `scripts/sql/`.

### 4.4 Config (`_clara_config`)
- `admin_chat_id` — chat del admin (se setea cuando esté disponible; sin él, el monitor corre pero no notifica).
- `fires_freshness_alerted_at` — timestamp del último aviso stale, o ausente si todo OK (estado anti-spam).
- `firms_map_key` — ya creado por el fix; este spec lo **versiona** (sin el valor literal).

## 5. Manejo de errores y bordes
- **`fires_cache` vacío / sin fila** → tratar como stale (no hay dato = problema), pero solo si ya hubo datos antes; con `fetched_at` nulo, alertar stale.
- **`admin_chat_id` ausente** → no notifica, responde `notified=false` con motivo; no es error.
- **Telegram falla** → `sendMessage` es best-effort (no rompe); el flag no se marca si no se pudo avisar, para reintentar en el próximo ciclo.
- **Falsa alarma transitoria** → el umbral de 60 min (4 ciclos) la absorbe.

## 6. Testing (TDD)
- `decideFreshnessAction`: stale-nuevo → `alert_stale`; stale-ya-avisado → `none`; recuperado-tras-aviso → `alert_recovered`; fresco-sin-aviso → `none`; borde exacto en el umbral.
- (El endpoint y el cron se verifican con un smoke manual + revisión; siguen el patrón no-mockeado del resto de rutas cron.)

## 7. Entregables versionados
- `src/lib/fires-freshness.ts` + test.
- `src/app/api/monitor/fires-freshness/route.ts`.
- `scripts/sql/whi-firms-map-key-config.sql` — el fix de rotación (sin la key literal: crea `clara_firms_map_key()` + recrea `fires_sync_step1_fetch()`; el `INSERT` del valor va comentado como paso manual).
- `scripts/sql/whi-firms-freshness-cron.sql` — el `pg_cron`.
- Nota de rotación del MAP_KEY en `SECURITY-AUDIT.md`.
