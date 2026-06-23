# Alertas de prevención por Telegram — diseño

**Fecha:** 2026-06-23
**Estado:** diseño aprobado, pendiente de plan de implementación
**Rama:** `feat/fwi-prevention-alerts`

## 1. Motivación

El milestone de prevención FWI está completo: el motor calcula un forecast de peligro de
incendio de 16 días por zona, calibrado por percentiles y traducido a lenguaje ciudadano
(`DANGER_COPY`). Hoy ese forecast solo se ve en la página `/provincia/[id]` (privada).

Este sub-proyecto cierra el círculo del producto: pasar de **"podés mirar el peligro"** a
**"te aviso antes de que haya foco"**. Cuando una zona cruza a peligro alto o más en el
pronóstico, el bot Clara avisa por Telegram a los suscriptores que optaron in. Es el salto
de valor que conecta la capa de prevención con el go-to-market vía cuarteles.

El spec original del FWI (`2026-06-17-prevencion-fwi-design.md`, §6.2/6.3) ya había bosquejado
estas alertas; este documento las diseña en detalle e incorpora un cambio de contexto: hoy
el FWI solo cubre Tierra del Fuego (2 zonas), así que el opt-in se ofrece únicamente a los
subs en zona cubierta.

## 2. Decisiones tomadas (brainstorming)

1. **Scope:** diseño completo — alerta por cruce + briefing diario + centro de preferencias
   unificado en el onboarding + reset al cambiar ubicación.
2. **Alcance del centro de preferencias:** los focos cercanos (core del servicio, gobernados
   por el rol) quedan **siempre activos**; el menú controla solo las capas opcionales: rayos
   y prevención. Nadie puede apagar por error la alerta de un incendio real cercano.
3. **Disparo de la alerta:** ventana de **hoy + próximos 2 días** (3 días); dispara en
   **alto o más**; una alerta por episodio (no repite mientras siga arriba); re-alerta solo
   si escala a un nivel mayor.
4. **Cobertura:** la opción de prevención se ofrece **solo si el lat/lng del sub cae en una
   zona FWI cubierta** (hoy TDF). Los demás no ven la opción; se activa sola cuando se agregue
   su provincia.
5. **Arquitectura de ejecución:** ruta TS separada `/api/prevention-alerts` disparada por
   pg_cron después del `fire-danger-sync` (enfoque A).

## 3. Arquitectura y flujo

**Pieza nueva:** `src/app/api/prevention-alerts/route.ts` (GET, gated por `isCronAuthorized()`),
disparada por un pg_cron `prevention-alerts` que pega a `/api/prevention-alerts?secret=…` a
las **09:30 UTC (06:30 ART)** — ~30 min después del `fire-danger-sync` (09:00 UTC), garantizando
que el forecast del día ya está en `fire_danger`.

Una sola pasada diaria:

1. **Forecast vigente:** para cada zona cubierta, lee de `fire_danger` el `computed_at` más
   reciente y arma la serie `target_date → danger_class` (hoy + próximos días). Reusa la lib
   server de fire-danger.
2. **Subs activos:** `prevention_mode IN ('alerts','daily')`.
3. **Por cada sub:** deriva su zona desde `lat/lng` (point-in-zone). Si no cae en zona cubierta
   → skip defensivo.
4. **Rama según modo** (públicos disjuntos):
   - `alerts` → evalúa el trigger por cruce; si dispara, dedup + `sendMessage()`. Días tranquilos
     = silencio.
   - `daily` → arma el briefing del día (incluye cualquier escalada) + dedup por fecha +
     `sendMessage()`. Un mensaje por día.

El cómputo del FWI sigue intacto en el sync Python; esta ruta solo **lee y notifica**, igual que
la frontera `goes-sync` / `goes-alerts`.

## 4. Modelo de datos

Tres cambios de schema, todos con RLS habilitado y anon/auth bloqueados (service_role bypassa),
consistentes con el resto del proyecto.

### 4.1 Opt-in en `subscribers`
```sql
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS prevention_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (prevention_mode IN ('off','alerts','daily'));
```
Default `'off'`: los subs existentes no reciben nada hasta optar in explícitamente.

### 4.2 Dedup de alertas por cruce — `prevention_alerted`
Modela el "episodio" (la zona en alto+).
```sql
CREATE TABLE prevention_alerted (
  zone_id       TEXT NOT NULL,
  chat_id       BIGINT NOT NULL,
  alerted_class TEXT NOT NULL,   -- nivel más alto ya avisado en el episodio actual
  alerted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, chat_id)
);
```
- Existe una fila por (zona, sub) mientras dura el episodio.
- Cuando la zona baja de alto → se borra la fila → fin de episodio → un cruce futuro re-avisa.
- Escalada: si el nivel actual supera `alerted_class` → re-avisar + `UPDATE`.
- `alerted_class` guarda el **pico del episodio**, así que las idas y vueltas dentro del mismo
  episodio no generan spam.

### 4.3 Idempotencia del briefing — `prevention_briefing_sent`
```sql
CREATE TABLE prevention_briefing_sent (
  chat_id   BIGINT NOT NULL,
  sent_date DATE NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, sent_date)
);
```
`INSERT … ON CONFLICT DO NOTHING` antes de mandar → si el cron se re-dispara el mismo día, no
manda dos veces (race-safe, igual que `goes_alerted`).

### 4.4 Notas de diseño
- **Zona derivada on-the-fly, no cacheada.** En cada corrida (y en el bot al ofrecer el opt-in)
  se calcula la zona del sub por point-in-zone sobre su `lat/lng`. Siempre correcto, sin columna
  `prevention_zone_id` que sincronizar; al cambiar de ubicación el reset es solo `prevention_mode`.
  Barato (pocas zonas, 1×/día).
- **Dos tablas en vez de una:** el dedup por *episodio* y por *fecha* tienen semánticas distintas.
- **Cleanup:** `prevention_alerted` se autolimpia al bajar el episodio; `prevention_briefing_sent`
  lo poda un prune defensivo (>30 días) dentro de la misma corrida.

## 5. Lógica de disparo

**Orden de clases** (reusa `fire-danger.ts`): `bajo`(0) < `moderado`(1) < `alto`(2) <
`muy alto`(3) < `extremo`(4). Umbral: **≥ alto (≥2)**.

**Ventana:** el peor nivel (`peak`) entre los `target_date` de **hoy + próximos 2 días**. Ese
pico es lo que se evalúa y lo que se comunica (incluye el `target_date` del pico para decir
"sube a extremo el miércoles").

**Algoritmo** (modo `alerts`), por sub con zona `Z`:
```
peak = max(danger_class)  sobre target_date ∈ [hoy .. hoy+2]
prev = prevention_alerted[Z, chat_id].alerted_class   (o null)

si peak < alto:
    si prev existe → DELETE (fin de episodio)
    no avisar
si peak ≥ alto:
    si prev == null            → AVISAR(peak)            # cruce inicial
    elif peak > prev           → AVISAR(peak, escalada)  # subió de nivel
    else                       → no avisar               # ya avisado, sin escalada
    UPSERT alerted_class = max(prev, peak)               # solo si se avisó
```
Cubre: cruce inicial, escalada (alto→extremo re-avisa), no-spam (mismo nivel / bajada parcial),
reinicio de episodio (baja de alto → borra → cruce futuro re-avisa).

## 6. Derivación de zona

`findDangerZone(lat, lng)` en lib server compartida (bot + ruta de alertas):
- Fast-reject por **bbox** `[south, north, west, east]`; si la zona tiene `geometry` jsonb →
  point-in-polygon preciso; si no, el bbox basta (las 2 zonas TDF son grandes y no se solapan).
- Devuelve la zona o `null` (no cubierto). En caso defensivo de solape, gana la primera coincidencia.

La misma función se usa en dos momentos: el bot decidiendo si **ofrecer** el opt-in, y el cron
decidiendo a **quién** alertar. Una sola fuente de la regla de cobertura.

## 7. Bot UX

### 7.1 Centro de preferencias — `/preferencias`
Menú único con botones inline:
```
⚙️ Tus avisos

🔥 Focos cercanos — siempre activos (es el corazón del servicio)
⚡ Rayos / tormenta seca:        [ ✅ Activado ]
🌲 Prevención (peligro de incendio):
     [ Resumen diario ]  [ Solo si hay peligro ]  [ No, gracias ]
```
- **Focos** sin toggle (transparencia: "esto siempre llega").
- **Rayos** = toggle de `lightning_enabled`.
- **Prevención** = `daily` / `alerts` / `off`. **La fila solo aparece si el sub está en zona
  cubierta** (`findDangerZone` ≠ null); si no, se omite.
- Cada botón → callback → `UPDATE` + `answerCallbackQuery` + re-render con `editMessageText`.
- **Comandos:** `/preferencias` es el centro; `/rayos` y `/prevencion` quedan como atajos que
  abren el menú. Se registran en `setMyCommands` (`/api/bot/sync-commands`).

### 7.2 Onboarding y cambio de ubicación
- **Tras fijar la ubicación:** si cae en zona cubierta, Clara explica la prevención y ofrece los
  tres botones. Si no, no se menciona.
- **Reset al cambiar ubicación:** comparar la zona derivada de la ubicación vieja vs la nueva. Si
  **cambió de zona o salió de cobertura** → reset `prevention_mode='off'` + re-ofrecer. Si sigue
  en la misma zona → **mantener** el modo.

### 7.3 Contenido de mensajes (reutilizan `DANGER_COPY` ciudadano)

**Alerta por cruce** (`alerts`):
```
🔥 Aviso de prevención — Estepa Fueguina Norte

El peligro de incendio sube a EXTREMO 🔴 el miércoles 25/06.

{qué significa, en lenguaje ciudadano}
{qué hacer / qué evitar}

Es un pronóstico — todavía no hay foco. Te aviso para prevenir.
Ajustá tus avisos: /preferencias
```
En escalada: *"El peligro SUBE de alto a EXTREMO…"*.

**Briefing diario** (`daily`):
```
🌲 Resumen — Bosque Fueguino Sur · 24/06

Hoy: MODERADO 🟡 — {qué significa, corto}
Próximos días: sube a ALTO el jueves.

/preferencias para ajustar
```
Día tranquilo → versión corta: *"Hoy: bajo 🟢 — sin novedades. Outlook estable."*

## 8. Manejo de errores

- **`sendMessage` best-effort:** un envío que falla se loguea y la corrida sigue (no aborta). La
  ruta devuelve un resumen (alertas/briefings/errores) para logs, como las otras rutas.
- **Orden del dedup según prioridad de fallo:**
  - *Alerta por cruce* → marcar `prevention_alerted` **después** de un envío OK (prioriza **no
    perder** un aviso de peligro; un fallo se reintenta mañana).
  - *Briefing* → `INSERT … ON CONFLICT DO NOTHING` **antes** de mandar (prioriza **no duplicar**;
    perder un briefing no importa).

## 9. Testing (vitest, TDD)

- **Algoritmo de trigger** (función pura) → tabla de casos: cruce inicial, escalada, no-spam
  (mismo nivel / bajada parcial), reinicio de episodio, ventana de 3 días.
- **`findDangerZone`**: point-in-bbox, point-in-polygon, fuera de cobertura (null), TDF norte vs sur.
- **Armado de mensajes**: alerta (inicial + escalada) y briefing (con cambios / día tranquilo),
  lenguaje ciudadano correcto.
- **Ruta** con Supabase + Telegram mockeados: selecciona los subs correctos, deduplica, nunca
  manda a `off`, respeta el orden del dedup.

## 10. Configuración de cron

pg_cron nuevo `prevention-alerts` (`30 9 * * *` = 06:30 ART), pg_net GET a
`/api/prevention-alerts?secret=…` usando `clara_cron_secret()` (igual que los crons existentes).
SQL versionado en `scripts/sql/`.

## 11. Fuera de scope / follow-ons

- Cobertura más allá de TDF (se habilita sola al sumar provincias — ver
  `project_fwi_multiprovince_scaling`).
- Lista de espera por provincia (señal de go-to-market) — diferido.
- Limpieza de subs que bloquearon el bot (Telegram 403) — solo loguear por ahora.
- Hora del briefing configurable por sub — por ahora fija 06:30 ART.
