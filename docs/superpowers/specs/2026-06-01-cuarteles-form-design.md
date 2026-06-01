# Form de alta de cuarteles en `/cuarteles` — Diseño

**Fecha:** 2026-06-01
**Autor:** sesión Claude Code + soysebalopez@gmail.com
**Branch:** `feat/bomberos-copy`

## Problema

En `/cuarteles` (`src/app/(main)/cuarteles/page.tsx:250-254`) el párrafo para jefes de
cuartel cuyo cuartel todavía no está dado de alta dice "Escribinos por el bot y
coordinamos el alta". Es un callejón sin salida: el bot solo procesa **comandos**
(`/soybombero`, `/ciudad`, etc.) vía webhook; un texto libre no le llega a ningún
humano. Además el CTA final "Sumá a tu cuartel → Abrir bot" es engañoso: abrir el bot
no da de alta ningún cuartel.

Esto corresponde a la **Opción A — Mínima** del `FIREMAN-ONBOARDING-PLAN.md`: un form de
contacto que valida demanda sin construir el sistema de auto-emisión de códigos completo.

## Solución

Formulario real en `/cuarteles` que envía la solicitud por email a
**soysebalopez@gmail.com** vía **Resend**.

### 1. Componente `src/components/cuarteles/cuartel-request-form.tsx` (`'use client'`)

Campos:

- **Requeridos:** nombre del cuartel, provincia, localidad, nombre/cargo del contacto,
  teléfono/WhatsApp.
- **Opcionales:** email de contacto, mensaje/notas (textarea).
- **Honeypot:** campo oculto `website` — si viene lleno, el backend descarta en silencio.
  Sin captcha por ahora (se suma Cloudflare Turnstile si aparece abuso, como dice el plan).

Estados: `idle` → `submitting` → `success` (mensaje de confirmación reemplaza el form) /
`error` (mensaje + permite reintentar). Respeta el design system: Outfit/Geist Mono,
accent `#e8622c`, surfaces `--surface`/`--background`, borders `--border`, `<Pill>`.

### 2. API route `src/app/api/cuarteles/request/route.ts` (POST)

- Valida que los campos requeridos estén presentes y no vacíos → 400 si falta alguno.
- Si el honeypot viene lleno → responde `{ ok: true }` sin enviar nada (no le damos pistas al bot).
- Envía email a `soysebalopez@gmail.com` vía Resend:
  - `from: "AlertaForestal <onboarding@resend.dev>"` (remitente compartido de Resend, sirve
    para mandar al mail de la propia cuenta sin verificar dominio).
  - `reply-to:` el email del cuartel si lo dejaron, así se responde directo.
  - Subject: `🚒 Nuevo cuartel: <nombre> (<provincia>)`.
  - Body con todos los campos formateados (texto plano + HTML simple).
- Cliente Resend con **lazy init** (nunca en module scope — mismo patrón que `getSupabase()`,
  porque Vercel evalúa las rutas en build).
- Si falta `RESEND_API_KEY` → 500 con mensaje claro en el log; el form muestra error genérico.

### 3. Editar `src/app/(main)/cuarteles/page.tsx`

- Quitar el párrafo "Escribinos por el bot" (250-254).
- Mantener hero, comparativa y los 3 pasos (ese flujo sirve para cuarteles que **ya** tienen código).
- Rehacer la sección CTA final: pasa a ser **"Sumá a tu cuartel"** con el **formulario**
  embebido (conserva el fondo con glow radial accent actual). Debajo, link secundario chico:
  "¿Tu cuartel ya tiene código? Activá el modo bombero desde el bot →".
- Mantener el "← Volver al inicio".

### 4. Dependencia

- Agregar `resend` a `package.json` (npm).

## Fuera de alcance

- Quick-wins del bot (`/soybombero` en `/help`, mejorar mensaje sin código): separados.
- Tablas `cuarteles` / `cuartel_requests`, auto-emisión de códigos, dashboard de requests:
  son Opción B/C del plan, no se tocan ahora.
- Verificación de dominio `alertaforestal.org` en Resend: se difiere; `onboarding@resend.dev` alcanza.

## Acción del owner (sin esto el form no envía)

1. Crear cuenta en https://resend.com con `soysebalopez@gmail.com`.
2. Copiar la API key (`re_...`) desde el dashboard de Resend.
3. Agregar `RESEND_API_KEY` en Vercel (Project Settings → Environment Variables, todos los
   entornos) y redeploy.

Mientras tanto el resto del sitio y el build no se ven afectados.
