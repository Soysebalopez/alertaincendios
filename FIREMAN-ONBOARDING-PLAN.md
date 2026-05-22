# Fireman Onboarding — Plan & Context

**Status:** ⏸️ PAUSED · 2026-05-22 — postergado a un update futuro a pedido del owner.
**Owner:** soysebalopez@gmail.com
**Última revisión:** 2026-05-22

---

## Por qué este doc existe

El rol `fireman` ya está implementado en el bot (`WHI-588`) pero **no está comunicado en `alertaforestal.org`**. Un jefe de cuartel que entra al sitio se va sin enterarse de que existe un canal operativo dedicado. Este doc captura el análisis completo del flujo actual + las opciones evaluadas para ofrecerlo desde la web, para que la próxima sesión arranque sin re-investigar.

## Cómo funciona hoy el rol fireman

### Flujo de alta

1. El usuario hace suscripción normal (`/start` + ubicación o `/ciudad <nombre>`) → queda como `role='civilian'` por default.
2. Cuando tiene un código de invitación, hace `/soybombero <CODIGO>` (`src/app/api/bot/telegram/route.ts:473`).
3. El bot invoca la RPC `consume_fireman_code(p_chat_id, p_code)` (definida en `scripts/sql/whi-fireman-codes-hardening.sql`) que atómicamente:
   - Valida que el código existe
   - Verifica que ese `chat_id` no lo usó antes (audit trail en `fireman_code_usage`)
   - Verifica que no está agotado (`used_count < max_uses`)
   - Incrementa `used_count`, registra el uso, y promueve `subscribers.role='fireman'` + setea `subscribers.cuartel_name`
4. Confirma con "✅ Listo, bombero de \<cuartel\>".

Sin código, `/soybombero` solo dice "Si tu cuartel tiene un código, usalo así. Si no, escribinos." Ese "escribinos" no tiene contacto ni link.

### Qué reciben distinto los firemen

| Aspecto | Civilian | Fireman |
| --- | --- | --- |
| Alerta FIRMS | Mensaje con interpretación AI (Groq), tono vecino-ciudadano | Mensaje operativo crudo: FRP, confianza, viento, coords, link Maps. Sin AI. Firmado por cuartel (`src/app/api/alerts/route.ts:408`) |
| GOES preliminary | Solo focos en zona forestal (WUI 5km buffer) | Todos los focos detectados (sin filtro forestal) (`src/app/api/alerts/route.ts:62`) |
| Header | "🔥 Posible foco a Xkm" | "🚨 Foco a Xkm — coordinación" |

### Cómo se gestionan los códigos hoy

- Tabla `fireman_codes (code, cuartel_name, used_count, max_uses)`
- **No hay UI** para crear códigos — se hacen a mano con SQL en Supabase (project `qmzuwnilehldvobjsbcs`).
- Auditados contra TOCTTOU con RPC `SECURITY DEFINER` + row lock implícito.

---

## Problemas identificados

### Bloquean adopción (críticos)

1. **No hay onboarding en la web** — `alertaforestal.org` no menciona en ningún lado que existe el rol fireman.
2. **No hay forma de solicitar un código** sin contacto humano vago. El mensaje del bot dice "escribinos" pero no dice dónde.
3. **No hay UI admin** para emitir códigos. Cada alta nueva requiere acceso manual a Supabase.

### De producto (medios)

4. **`/help` no lista `/soybombero`** — incluso quien tiene el código por otro canal podría no descubrir el comando.
5. **No hay revocación** — si un bombero deja el cuartel, sigue recibiendo alertas operativas. `/cancelar` borra todo el sub (incluso lat/lng), no hay "volver a civilian sin perder suscripción".
6. **Sin deduplicación de `cuartel_name`** — `fireman_codes.cuartel_name` es texto libre. Dos códigos con strings distintos ("Cuartel Bahía Blanca" vs "Bomberos Bahía Blanca") cuentan como cuarteles diferentes. Esto contamina la métrica "Top cuarteles" en `/dashboard/superadmin`.

### De seguridad (bajos pero reales)

7. **No hay validación de identidad** del que usa el código. El sistema confía en que el código solo se comparte dentro del cuartel.
8. **`max_uses` por defecto desconocido** — si están creando códigos con `max_uses` muy alto "por las dudas", la protección es teórica.

---

## Opciones evaluadas para ofrecerlo en la web

### Opción A — Mínima (1-2h)

- Sección en `/como-funciona`: "¿Sos bombero voluntario?" + form de contacto (email o Telegram personal) para solicitar código manualmente.
- **Pro:** rápido, valida demanda antes de invertir más.
- **Con:** el owner sigue emitiendo códigos a mano.

### Opción B — Intermedia (4-6h)

- Página `/cuarteles` dedicada con hero, tabla comparativa civilian vs fireman, form que crea row en tabla `cuartel_requests` (status='pending').
- El owner ve esas requests en `/dashboard/superadmin` y aprueba/emite código desde ahí.
- **Pro:** experiencia profesional, todo trackeable.
- **Con:** sigue requiriendo intervención manual.

### Opción C — Avanzada (8-12h) ✅ ELEGIDA

Auto-emisión con verificación. Tres sub-variantes evaluadas:

- **(C.1) Email OTP** — `provider: Resend` (todavía no configurado, costo cero hasta 3k/mes).
  - Pro: estándar familiar.
  - Con: el bombero igual tiene que copiar/pegar al bot Telegram. Dos saltos UX.
- **(C.2) Telegram deep-link** — Form devuelve URL `https://t.me/alertaforestal_bot?start=cuartel-TOKEN`. Bot intercepta `start` con token, promueve directo.
  - Pro: cero dependencia de email, chat_id ya verifica que tiene Telegram, un solo salto.
  - Con: requiere modificar `handleStart` para parsear el token (~30 líneas).
- **(C.3) Aprobación manual diferida** — Form crea request, owner aprueba con un click desde `/dashboard/superadmin` y genera código para copiar/pegar.
  - Pro: cero auto-emisión = cero abuso.
  - Con: no escala.

**Decisión 2026-05-22:** se va con Opción C — **probablemente con Resend (C.1) o evaluando también canales nuevos** (ver sección "Próximos pasos"). La decisión final del sub-modelo queda abierta para retomar.

---

## Diseño que estaba listo para implementar antes de pausar

### Ubicación en el sitio

- **Teaser en landing**: insertar nueva sección entre `src/app/(main)/page.tsx:626` ("Datos abiertos / Fuentes de datos") y `src/app/(main)/page.tsx:731` ("HISTORIAL CTA CARD"). Debe mantener el design system del sitio: Outfit/Geist Mono, accent `#e8622c`, surfaces `#131311`/`#1a1a17`, borders `#252520`, ember particles, Pills con icono Phosphor.
- **Página `/cuarteles`** dentro del route group `(main)` (nav + footer + EmberParticles), con hero, tabla comparativa y form.

### Schema (fase 1)

Nuevas tablas:

```sql
CREATE TABLE cuarteles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  provincia text NOT NULL,
  ciudad text,
  verified boolean NOT NULL DEFAULT false,
  created_by_chat_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cuartel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuartel_id uuid REFERENCES cuarteles(id),
  requester_name text NOT NULL,
  requester_role text,
  requester_email text,            -- si vamos por Resend
  requester_chat_id bigint,        -- si vamos por Telegram deep-link
  verification_token text UNIQUE,
  token_expires_at timestamptz,
  redeemed_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fireman_codes ADD COLUMN cuartel_id uuid REFERENCES cuarteles(id);
-- Backfill: crear rows en cuarteles para cada cuartel_name distinto y vincular.
```

### Backend (fase 2)

- `POST /api/cuarteles/request` — valida form, rate-limit por IP (3 req/h), crea `cuartel_requests` + token aleatorio, devuelve el siguiente paso (deep link o "te mandamos un mail").
- Si Telegram: modificar `handleStart` en `src/app/api/bot/telegram/route.ts:70` para parsear `start cuartel-TOKEN`, verificar vigencia (24h), generar código en `fireman_codes` con `cuartel_id` y `max_uses=5`, marcar `redeemed_at`, mandar mensaje al solicitante con el código.
- Si Resend: nuevo endpoint `POST /api/cuarteles/verify-otp` que valida el OTP, emite código, y manda el código por email.
- Notificar al `OWNER_CHAT_ID` por Telegram cuando se emite un código nuevo ("nuevo cuartel: X, provincia Y").

### Defaults discutidos antes de pausar

- `max_uses` default por código auto-emitido: **5** (pendiente confirmar).
- Captcha: **sin captcha por ahora**, agregar Cloudflare Turnstile si vemos abuso.
- Notificación a owner por Telegram (necesita `OWNER_CHAT_ID` en env).

---

## Quick wins independientes (se pueden hacer en cualquier momento)

Estos no dependen de la decisión del flow completo y se pueden mergear aparte:

- [ ] Sumar `/soybombero` al `/help` del bot (1 línea en `src/app/api/bot/telegram/route.ts:140`).
- [ ] Mejorar el mensaje de `/soybombero` sin args para que tenga un link/contacto concreto en vez de "escribinos" vago (`src/app/api/bot/telegram/route.ts:474`).
- [ ] Migrar `cuartel_name` a tabla canónica `cuarteles` (con FK desde `fireman_codes`) — limpia las métricas del superadmin hoy. Se puede hacer sin tocar el flow de onboarding, manteniendo el comportamiento actual del bot.

---

## Próximos pasos cuando se retome

### Decisiones pendientes (en orden)

1. **Confirmar provider de email**: ¿Resend? El owner mencionó "probablemente Resend" — falta confirmar y crear cuenta + setear `RESEND_API_KEY` como env var en Vercel.
2. **Evaluar canales adicionales de comunicación**: el owner mencionó "también vamos a evaluar otras vías de comunicación con los notificados". Esto es trabajo de discovery aparte — ver doc relacionado o sección "Canales alternativos" abajo. El producto hoy es Telegram-only; cualquier canal nuevo afecta toda la base de suscriptores, no solo firemen.
3. **Cerrar sub-variante de C** (C.1 email OTP vs C.2 Telegram deep-link vs C.3 manual). Recomendación previa: C.2 por encajar con el producto Telegram-first, pero si vamos a meter Resend igual para otros canales (alerta por email a civilian, por ejemplo), C.1 se vuelve más atractivo.
4. **Confirmar `max_uses` default, captcha, notificación, OWNER_CHAT_ID**.

### Trabajo de fondo a evaluar en paralelo

- **Canales alternativos de notificación** (separate concern, related). Hoy todo va por Telegram. Alternativas a evaluar (no atadas al fireman onboarding):
  - **WhatsApp Business API**: ticket `WHI-550` ya existía en el board como pendiente de owner action. Requiere número verificado + template approvals.
  - **SMS**: ticket `WHI-591` (análisis hecho, decisión pendiente). Costo por mensaje, útil en zonas con conectividad pobre.
  - **Email** (vía Resend): bajo costo, alto opt-in, pero baja inmediatez para alertas tempranas.
  - **RSS/webhook**: nicho, útil para integraciones con sistemas operativos de cuarteles.
- **Revocación de firemen**: agregar comando `/dejarcuartel` o flag en `subscribers.role` que permita pasar de `fireman` a `civilian` sin perder la suscripción.
- **Verificación cruzada con federaciones de bomberos**: el Consejo Nacional de Federaciones de Bomberos Voluntarios podría aportar listado de cuarteles. Sin API pública, requiere scraping o convenio.

### Cómo arrancar la próxima sesión

1. Leer este doc completo.
2. Confirmar con el owner las 4 decisiones pendientes de la lista.
3. Si la decisión incluye Resend: crear cuenta en resend.com, configurar dominio `alertaforestal.org` con SPF/DKIM, agregar `RESEND_API_KEY` en Vercel.
4. Aplicar la migration de schema (`cuarteles` + `cuartel_requests` + `fireman_codes.cuartel_id`).
5. Implementar backend según sub-variante de C elegida.
6. Implementar UI (teaser landing + página `/cuarteles`) respetando design system.
7. Migrar `cuartel_name` existentes a la tabla canónica.

---

## Archivos relevantes para retomar

- `src/app/api/bot/telegram/route.ts` — handlers del bot, incluye `handleSoyBombero` (línea 473) y `handleStart` (línea ~150) que sería el punto de modificación para Telegram deep-link.
- `src/app/api/alerts/route.ts:408` — `formatFiremanAlert`, mensaje operativo que reciben los firemen.
- `src/app/api/alerts/route.ts:62` — lógica de filtro forestal que se omite para firemen.
- `src/app/api/goes-alerts/route.ts` — equivalente para detecciones GOES preliminary.
- `scripts/sql/whi-fireman-codes-hardening.sql` — RPC `consume_fireman_code`, audit trail, CHECK constraints.
- `src/app/(main)/page.tsx:626` — ubicación del teaser en landing (entre Fuentes de datos e Historial CTA).
- `src/app/(main)/como-funciona/page.tsx` — referencia de design system (hero, FAQ cards, CTA gradient).
- `src/app/login/login-form.tsx` — referencia de estilo de inputs para el form de `/cuarteles`.

## Bibliografía

- WHI-588 (Sprint 1) — implementación inicial del rol fireman en el bot.
- WHI-550 — WhatsApp Business (pendiente de owner action).
- WHI-591 — SMS (análisis hecho, decisión pendiente).
- `CLAUDE.md` — sección "Project Status" tiene el estado de los tickets.
