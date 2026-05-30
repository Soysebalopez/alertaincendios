# AlertaForestal — Plan de Ejecución · Piloto Tierra del Fuego

> **Fecha inicio:** 2026-05-30 · **Owner:** soysebalopez@gmail.com
> **Tracker de ejecución.** Estrategia completa en `founders_meeting.md` + doc Linear "Founders Meeting". A medida que se completa cada ítem se tilda `[x]` con fecha. Branch de código: `feat/tdf-p0-p1-quickwins`.

## Contexto

Producto técnicamente terminado, **1 usuario real (el owner), 0 bomberos**. Fase = go-to-market. Piloto elegido: **Tierra del Fuego** (después se amplía). Timing: temporada baja → ventana hasta ~1-oct para tener todo listo y verificado antes del alto riesgo.

### Hallazgo crítico del workflow de investigación (2026-05-30)
**TdF NO está cubierta por la detección.** Dos exclusiones acumuladas: (1) el polígono `ARGENTINA_VERTICES` (TS + Python) no incluye la isla → todo foco fueguino se descarta en origen; (2) el polígono forestal `andino-patagonico` está recortado en lng -68. Las páginas `/ciudad` de Ushuaia/Río Grande/Tolhuin muestran siempre "Sin actividad". **Es el bloqueador del piloto.**

### Decisiones del owner (2026-05-30)
- ✅ Arreglar los polígonos para cubrir TdF.
- ✅ Revocar ya el `clara_cron_secret` expuesto a anon.
- ✅ Activar lightning-alerts como pg_cron en la nube.
- ✅ Arrancar el trabajo solo-código en branch + PR.

---

## TODO

### 🔴 P0 — Bloqueadores (habilitan el piloto)
- [x] **P0-1 · Extender el polígono Argentina para incluir la isla de TdF** — *2026-05-30, en branch; pendiente merge+deploy.* Ring SEPARADO `TIERRA_DEL_FUEGO_VERTICES` (borde oeste = meridiano -68.61) + `isInArgentina` ahora hace OR de los dos rings. `src/lib/argentina-polygon.ts` **+** `api/goes-sync.py` (idénticos, verificado). Geometría verificada con test: Ushuaia/Río Grande/Tolhuin entran; Porvenir/Punta Arenas/Navarino (Chile) NO entran al ring nuevo; BA/Bariloche/Río Gallegos siguen OK. (Pre-existente fuera de scope: el ring continental viejo ya incluía Porvenir/Pta Arenas del estrecho.)
- [x] **P0-2 · Cobertura forestal de TdF** — *2026-05-30, en branch; pendiente merge+deploy.* En vez de mezclar en andino-patagonico (ensanchaba su bbox + etiqueta confusa), se creó una **zona dedicada `tierra-del-fuego`** ("Bosque Fueguino"): generada desde **MapBiomas Coll 2 clase 3** vía pipeline gdal leyendo el GeoTIFF por rango (`/vsicurl`, sin bajar los 650 MB). 250 polígonos, 38 KB, server-only. Registrada en `forest-zones.ts` + `forest-zones-geo.ts`. Pipeline en `scripts/forest-tdf-pipeline.sh`. Verificado: Ushuaia (1.1km) y Tolhuin (2.4km) caen en el buffer WUI 5km → tagean `tierra-del-fuego`; Río Grande (estepa, 30km) y resto del país → null. typecheck OK.
- [ ] **P0-3 · Verificación post-deploy TdF** — geometría (P0-1) y tagging forestal (P0-2) verificados a nivel lógico. Falta post-deploy: foco sintético (TESTING.md) o real aparece en `/api/fires`, tagea `tierra-del-fuego`, y `/ciudad/tierra-del-fuego/{ushuaia,rio-grande,tolhuin}` deja de decir "Sin actividad".
- [x] **P0-4 · Revocar EXECUTE de RPCs sensibles a anon** — *2026-05-30, aplicado a prod (migración `revoke_anon_execute_sensitive_rpcs`).* `clara_cron_secret` + `consume_fireman_code` de anon/authenticated; `clara_cron_health` + `whitebay_daily_metrics` de PUBLIC/anon (dashboard conserva authenticated). Crons corren como postgres (no afectados).

### 🟠 P1 — Distribución (el corazón) + higiene
- [x] **P1-1 · Quick-wins bot bomberos** (solo código) — *2026-05-30, en branch `feat/tdf-p0-p1-quickwins`; pendiente merge+deploy del owner.* `/soybombero` agregado a `/help`; nuevo `/dejarcuartel` (vuelve a civilian sin perder lat/lng); mensaje sin args con CTA concreto en vez de "escribinos". `src/app/api/bot/telegram/route.ts`. (El "no rebotar código" / deep-link se movió a **P1-4**, que es su lugar correcto — requiere el flujo de creación+ubicación.)
- [x] **P1-2 · Web canal bomberos** (solo código) — *2026-05-30, en branch; pendiente merge+deploy.* Página `/cuarteles` (hero + comparación Vecino/Bombero + 3 pasos + CTA, replicando el design system de `/como-funciona`) + teaser CTA-card en el landing + entrada en `sitemap.ts` + mensaje del bot sin args ahora linkea a `/cuarteles`. (robots.ts ya permite `/` — no requiere cambio.)
- [x] **P1-3 · Fix bug 571 preliminares** (solo código) — *2026-05-30, en branch; pendiente merge+deploy.* Sacado el `early-return` de `goes-dismissals/route.ts` → la purga de huérfanos corre SIEMPRE (también con `goes_alerted` vacía). Verificar post-deploy que el conteo baja de ~580 a decenas.
- [ ] **P1-4 · Deep link bomberos + instrumentación `source`** — parsear payload de deep link (`route.ts:70` matchea `/start` exacto y descarta el resto) → `start=cuartel-TOKEN` crea+promueve en un flujo (elimina el "rebote de código") + `start=src-X` para campañas; `ALTER TABLE subscribers ADD COLUMN source/first_seen_source/campaign` (aditiva, first-write-wins). 🟡 migración a prod.
- [ ] **P1-5 · Outreach TdF** (pre-temporada, antes del 1-oct) — Dirección Provincial de Manejo del Fuego (institucional) → Bomberos Ushuaia (ancla) → Zona Norte / Tolhuin → medios (El Diario del Fin del Mundo, Info3). Pitch: Corazón de la Isla 2022 (turba) + Andorra 2024 (interfase). **Depende de P0-3** (no contactar hasta que TdF funcione).
- [x] **P1-6 · Activar cron lightning-alerts en la nube** — *2026-05-30, **aplicado a prod** (`schedule_lightning_alerts_cron`, jobid 16, active).* pg_cron `:11,:26,:41,:56` (offset de todos los demás → evita los 503 de concurrencia). El endpoint ya existía en prod. SQL en `scripts/sql/p1-6-lightning-cron.sql`; README actualizado. Ya NO depende del crontab local.

### 🟡 P2 — Robustez / higiene
- [ ] **P2-1 · Monitoreo de crons fail-open + dead-man's-switch** — `clara_cron_health()` JOIN `net._http_response` (status HTTP real, no solo "encolado") + `HEALTHCHECK_PING_URL` externo (Healthchecks.io) pingeado al final de cada cron. 🟡 toca prod (DB + env Vercel). Hubo 7× HTTP 503 silenciosos en 6h.
- [ ] **P2-2 · Recortar caja flaring "Cuenca Austral"** — `api/goes-sync.py:88` contiene Río Grande; al cubrir TdF (P0-1) suprimiría focos de baja FRP. Depende de P0-1. 🟡 toca prod.
- [ ] **P2-3 · `.env.local.example` completo + alinear tabla env del README** — faltan `TELEGRAM_WEBHOOK_SECRET`, `UPSTASH_*`, `SENTRY_DSN`, `FIRMS_API_KEY`, `NEXT_PUBLIC_SITE_URL`, (futuro) `HEALTHCHECK_PING_URL`. Solo código.
- [ ] **P2-4 · Reencuadrar métrica dashboard** — separar "detecciones GOES 7d" de "preliminares pendientes". `dashboard/_lib/metrics.ts:143`. Solo código, interno.

### 🔵 P4 — Diferido (cuando entre el primer cuartel real)
- [ ] **P4-1 · DDL `cuarteles` + `consume_fireman_code` a UPSERT + deep-link redeem** — 🟡 prod, requiere go explícito + primer cuartel comprometido.
- [ ] **P4-2 · Form self-service `/cuarteles` + aprobación manual 1-click** — `OWNER_CHAT_ID` en env. Depende de P4-1.

---

## Log de ejecución
- **2026-05-30** — Workflow de investigación (7 agentes) → hallazgo bloqueador TdF + plan.
  - ✅ **P0-4 seguridad** aplicado a prod (migración `revoke_anon_execute_sensitive_rpcs`; verificado anon=false, dashboard intacto). SQL en `scripts/sql/p0-4-revoke-anon-rpcs.sql`.
  - ✅ **P1-1 quick-wins bot** + ✅ **P1-3 fix 571** en branch `feat/tdf-p0-p1-quickwins` (typecheck OK; pendiente PR → merge → deploy del owner).
  - ✅ **P0-1 polígono TdF** (TS + Python) en branch, geometría verificada con test (`node`). Pendiente merge+deploy.
  - ✅ **Review independiente del PR #48** (agente code-reviewer): sin críticos. Aplicados 2 fixes en branch: (a) purga de huérfanos iterativa para no truncar en silencio a 1000 filas (`goes-dismissals`); (b) `/dejarcuartel` agregado a `/help` + mensajes de `/soybombero` corregidos (apuntaban a `/cancelar` destructivo).
  - ✅ **P1-2 web /cuarteles** + teaser landing + sitemap + link del bot. typecheck OK.
  - ✅ **P1-6 cron lightning** aplicado a prod (jobid 16). Tormenta seca ahora se dispara sola.
  - ✅ **P0-2 cobertura forestal TdF** — zona dedicada `tierra-del-fuego` desde MapBiomas (en branch). Cierra el bloqueador junto con P0-1: ahora un foco fueguino se detecta Y tagea forestal.
  - ⏭️ Próximo: **P1-4** (deep link + source). Luego: mergear PR + verificación post-deploy (P0-3); P2 (monitoreo crons/dead-man's-switch, métricas).
