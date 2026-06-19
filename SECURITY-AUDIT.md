# WHI-586 — Auditoría de seguridad CLARA (2026-05-11)

## TL;DR

**Repo público + 2 secrets críticos commiteados en historia git.** Toda la app está al revés sólida (service role solo en server, RLS habilitado, no anon key en cliente). El gap real son los scripts utility que tenían credenciales hardcoded.

**Acción requerida del owner (10 min):** rotar 2 secrets en panels externos.

## Findings

### 🔴 P0 — Secrets en código de un repo público

| Archivo | Secret | Acción |
|---|---|---|
| `scripts/backfill-fires.sh:10` | `SUPABASE_TOKEN=sbp_c6c178e8...` (Personal Access Token, **full project access**) | Rotar HOY en Supabase dashboard |
| `scripts/backfill-fires.sh:8` | `MAP_KEY=56276c396c...` (NASA FIRMS API) | Rotar en firms.modaps.eosdis.nasa.gov |
| `scripts/sync-fires.sh:11` | `SECRET=fad9f905b2...` (CRON_SECRET, ya en Vercel env) | Rotar CRON_SECRET en Vercel + actualizar pg_cron |
| `scripts/sql/whi-547-cron.sql`, `whi-584-crons.sql` | Mismo CRON_SECRET literal en strings de pg_cron schedule | Re-aplicar SQL con el secret nuevo |

**Impacto si los secrets quedaran sin rotar:**
- SUPABASE_TOKEN PAT permite ejecutar SQL arbitrario en la DB (DROP TABLE, INSERT, etc.). **Es el más severo.**
- MAP_KEY: alguien puede consumir tu rate limit de FIRMS.
- CRON_SECRET: alguien puede disparar `/api/alerts`, `/api/goes-sync`, etc. — molesto pero idempotente.

**Mitigación aplicada en este PR:**
- Todos los scripts ahora leen credenciales desde `scripts/*.env` (gitignored). Templates en `scripts/*.env.example`.
- Los archivos SQL usan placeholders `<CRON_SECRET>` con instrucción explícita de no commitear la versión rellena.

**Limpieza de git history:**
- Los secrets siguen presentes en commits anteriores del repo público. Una vez **rotados** los valores en los servicios, el contenido del history queda inútil (no es el secret activo).
- Si querés borrar las versiones expuestas igual, hay que usar `git filter-branch` o BFG Repo-Cleaner y force-push. Te lo dejo como opcional — el costo es que invalida los hashes de commit, que rompe forks/PRs viejos.

### 🟡 P1 — Falta de security headers en HTTP

`next.config.ts` no setea ningún header. Agregado en este PR:

- `Strict-Transport-Security` (HSTS) — 2 años, includeSubDomains, preload
- `X-Frame-Options: DENY` — protección clickjacking
- `X-Content-Type-Options: nosniff` — MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — limita leak de URL
- `Permissions-Policy` — drop camera/microphone, mantener geolocation (lo usamos)

Validación post-deploy: https://securityheaders.com/?q=alertaforestal.org (esperás A+ o A).

### 🟢 OK — cosas que están bien

| Check | Estado | Detalle |
|---|---|---|
| RLS habilitado en 8 tablas | ✅ | Aplicado en sesión anterior (WHI-RLS) |
| Service role key solo server | ✅ | `src/lib/supabase.ts` lee `process.env.SUPABASE_SERVICE_ROLE_KEY`, nunca exposed al cliente |
| Anon key no usado | ✅ | Toda lectura via service role, anon key ni siquiera está en env |
| `.gitignore` ignora `.env*` | ✅ | Refinado en este PR para también cubrir `scripts/*.env` |
| Bot tokens no en repo | ✅ | Histórico: @AlertaIncendiosBot (rotado), @AlertasClaraBot (deprecated post-rebrand). Actual: @alertaforestal_bot |
| /api/* endpoints auth | ✅ | Todos chequean `CRON_SECRET` antes de actuar (alerts, goes-sync, goes-alerts, goes-dismissals, lightning-alerts, fires/sync) |
| Telegram webhook firma | ⚠️ | El webhook `/api/bot/telegram` no valida que el request venga de Telegram. Telegram **no firma** webhooks por default — la mitigación común es agregar un secret token al URL del webhook |

### 🟡 P2 — Webhook de Telegram sin verificación de origen

Hoy `/api/bot/telegram` acepta cualquier POST. Si alguien adivina el endpoint y manda payloads válidos, puede simular comandos de subscribers (peor caso: cancelar suscripciones de otros).

**Fix recomendado (no urgente, lo dejo para WHI-586 v2 si querés):**
Telegram permite agregar un secret token al setWebhook que viene en el header `X-Telegram-Bot-Api-Secret-Token` de cada request.

```bash
curl -F "url=https://alertaforestal.org/api/bot/telegram" \
     -F "secret_token=$(openssl rand -hex 32)" \
     "https://api.telegram.org/bot<TOKEN>/setWebhook"
```

Y en el handler:
```ts
const expectedToken = process.env.TELEGRAM_WEBHOOK_SECRET;
const receivedToken = request.headers.get("x-telegram-bot-api-secret-token");
if (receivedToken !== expectedToken) return new Response("Unauthorized", { status: 401 });
```

## Procedimiento de rotación (acción del owner, 10 min)

### 1. Supabase Personal Access Token (5 min)

1. Login Supabase dashboard → **Account** (esquina sup. der.) → **Access Tokens**
2. Revocar el token viejo (`sbp_c6c178e8...`)
3. Generar uno nuevo con permisos mínimos necesarios (project access)
4. Copiarlo a `scripts/backfill.env` localmente:
   ```bash
   cp scripts/backfill.env.example scripts/backfill.env
   chmod 600 scripts/backfill.env
   # Editar y pegar el token nuevo
   ```
5. Validar con `./scripts/backfill-fires.sh 1` (1 día de backfill, debería andar)

### 2. NASA FIRMS MAP_KEY (3 min)

1. https://firms.modaps.eosdis.nasa.gov/api/map_key/ → solicitar nueva key (instant, gratis)
2. Revocar la vieja desde el panel de tu cuenta
3. Actualizar en los DOS lugares donde se usa:
   - **Cron de producción** (el que alimenta el mapa): la key vive en `_clara_config`
     (la lee `clara_firms_map_key()` desde `fires_sync_step1_fetch()`). Rotar = un UPDATE:
     ```sql
     update public._clara_config set value = '<MAP_KEY>', updated_at = now()
     where key = 'firms_map_key';
     ```
     (Aplicado 2026-06-19: antes la key estaba literal en la función SQL — ver
     `scripts/sql/whi-firms-map-key-config.sql`.)
   - **Backfill local**: pegar en `scripts/backfill.env` (gitignored).

> Nota: si la key se invalida, el cron sigue reportando "succeeded" pero el mapa se
> congela en silencio. El monitor `fires-freshness-monitor` avisa por Telegram cuando
> `fires_cache` deja de actualizarse (ver `scripts/sql/whi-firms-freshness-cron.sql`).

### 3. CRON_SECRET (5 min)

Más involved porque está en 3 lugares: Vercel, Supabase pg_cron jobs, y crontab local.

a. Generar un secret nuevo:
   ```bash
   openssl rand -hex 32
   ```

b. Actualizar en Vercel:
   - Settings → Environment Variables → `CRON_SECRET` → Edit → pegar nuevo
   - Redeploy production

c. Actualizar los 4 pg_cron jobs en Supabase (cada uno tiene el viejo embedded):
   ```sql
   -- Borrar viejos
   SELECT cron.unschedule('fires-alerts');
   SELECT cron.unschedule('goes-sync');
   SELECT cron.unschedule('goes-alerts');
   SELECT cron.unschedule('goes-dismissals');

   -- Re-crear con el secret nuevo (NO commitear este SQL con el valor)
   SELECT cron.schedule('fires-alerts', '4,19,34,49 * * * *',
     $$SELECT net.http_get('https://alertaforestal.org/api/alerts?secret=<NEW>', timeout_milliseconds := 60000)$$);
   SELECT cron.schedule('goes-sync', '5,15,25,35,45,55 * * * *',
     $$SELECT net.http_get('https://alertaforestal.org/api/goes-sync?secret=<NEW>', timeout_milliseconds := 60000)$$);
   SELECT cron.schedule('goes-alerts', '7,17,27,37,47,57 * * * *',
     $$SELECT net.http_get('https://alertaforestal.org/api/goes-alerts?secret=<NEW>', timeout_milliseconds := 60000)$$);
   SELECT cron.schedule('goes-dismissals', '0 12 * * *',
     $$SELECT net.http_get('https://alertaforestal.org/api/goes-dismissals?secret=<NEW>', timeout_milliseconds := 60000)$$);
   ```

d. Actualizar crontab local (residencial):
   ```bash
   cp scripts/sync-fires.env.example scripts/sync-fires.env
   chmod 600 scripts/sync-fires.env
   # Editar y pegar el secret nuevo
   ```

e. Validar — esperá el próximo tick del cron en Supabase y revisá `net._http_response` por `status_code: 200`.

## Mejoras opcionales (no en este PR)

- **Telegram webhook secret token** (P2 documentado arriba)
- **Rate limiting** en `/api/bot/telegram` para prevenir abuso
- **Audit log** de comandos del bot (qué chat_id ejecutó qué comando, cuando)
- **CSP header** (Content Security Policy) — más estricto que los actuales, pero requiere allowlist de tiles de Leaflet/Carto que es tricky de armar
- **Dependabot / Renovate** para alertas de vulnerabilidades en deps

## Files modified in this audit

- `scripts/sync-fires.sh` — secrets via `scripts/sync-fires.env`
- `scripts/sync-fires.env.example` — template
- `scripts/backfill-fires.sh` — secrets via `scripts/backfill.env`
- `scripts/backfill.env.example` — template
- `scripts/sql/whi-547-cron.sql` — `<CRON_SECRET>` placeholder
- `scripts/sql/whi-584-crons.sql` — `<CRON_SECRET>` placeholder
- `next.config.ts` — security headers
- `.gitignore` — explicit `scripts/*.env` exclusion
- `SECURITY-AUDIT.md` — this report
