# AlertaForestal — Founders Meeting

> **Fecha:** 2026-05-30
> **Propósito:** Documento para retomar la sesión de estrategia "modo founder". Captura el diagnóstico, las decisiones confirmadas, el mapa de potencial, el plan priorizado que vamos a seguir, el *cómo* de cada cosa, y las limpiezas necesarias.
> **Cómo usar este doc:** Leerlo entero al arrancar la próxima sesión. El plan priorizado (sección 5) es la fuente de verdad del orden de trabajo. A medida que se completa cada ítem, marcar el checkbox y dejar fecha.

---

## 1. Diagnóstico central (la verdad sin filtros)

**El producto está hecho. Lo que no existe es la distribución.**

AlertaForestal es ingeniería sólida y técnicamente terminada: detección dual GOES+FIRMS con latencia resuelta, filtro forestal con datos oficiales (MapBiomas Coll 2), bot Clara, calidad de aire, rayos secos, rol bombero, trayectorias satelitales. El problema **no es el producto** — es todo lo que lo rodea.

Realidad confirmada en la reunión: **hoy no hay difusión ni usuarios reales** (el "~1.000 usuarios" del doc de costos era placeholder). Esto reordena todo: **el 100% del trabajo relevante ahora es go-to-market**, no más features ni más fuentes de datos.

**Buena noticia + buen timing:** la parte difícil (construir el producto) ya está. Y estamos a fin de mayo → arranca la temporada baja de incendios. Hay ~5-6 meses para construir base de usuarios antes de la próxima primavera/verano (nov–mar), que es cuando el producto se vuelve indispensable.

---

## 2. Decisiones estratégicas confirmadas

1. **Satellites On Fire NO es competencia.** SoF apunta a empresas/privados; AlertaForestal apunta al civil. → **Tenemos un carril sin competencia (el ciudadano común).** El copy "empresa/gobierno/aseguradora → SoF" es correcto y deliberado; se mantiene.
2. **SatAI es el nombre VIEJO de AlertaForestal.** No es otro producto ni infra compartida con un tercero — es el mismo proyecto con naming legacy. Hay que limpiar las referencias que quedaron (ver sección 6).
3. **AlertaForestal es B2C civil, gratis.** El modelo de monetización B2G del doc `COSTOS_ALERTAFORESTAL.md` queda como exploración futura, NO como foco actual. No modelar provincias/tiers enterprise sin un design partner real.
4. **El moat es el dataset de eventos validados por la comunidad** (cuadrante 3: humanos reportan humo que el satélite todavía no vio). Está documentado en `FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md` pero **no construido**. Es prioridad real.

---

## 3. Blind spots que estábamos teniendo

- **(a) Optimizábamos la oferta (calidad/latencia/fuentes de detección) cuando el cuello de botella es la demanda (distribución + validación + confianza).** La detección ya está resuelta con GOES.
- **(b) El moat (feedback comunitario) no existe en el código.** `grep feedback|veo_humo|captureFeedback` en `src/` → cero. Cada alerta enviada sin botones de feedback es dato tirado a la basura.
- **(c) Preso de Telegram.** Penetración rural ~20% vs ~90% WhatsApp (dato del propio plan). Expansión a otros canales ya prevista por el owner.
- **(d) Sin instrumentación de tracción.** No sabemos números reales. → De acuerdo, a resolver (ver sección 5, P0).
- **(e) Fragilidad operativa / bus factor.** Owner único, códigos de bombero a mano con SQL, sin watchdog externo. → De acuerdo, soluciones en marcha (ver sección 5, P0 + 7).
- **(f) Liability + IA en emergencia.** "Clara" interpreta focos con Groq para civiles; una interpretación errada en una emergencia real es riesgo. Falta disclaimer/marco y blindar la asimetría ética ("ante la duda, la alerta queda"). → A implementar.

---

## 4. Mapa de potencial

### Dónde SÍ está el potencial (orden de leverage)
1. **Canal bombero/cuartel** — es el caballo de Troya de distribución *bottom-up*. El bombero es **canal + validador + credibilidad** a la vez. 1 cuartel adopta → empuja a todos sus vecinos. (Hoy: onboarding pausado → es el trabajo de mayor leverage estacionado.)
2. **Loop de feedback comunitario → dataset.** Único activo inimitable. Construir simple (reglas, no ML) y *guardar bien los datos desde el día 1*.
3. **Expansión de canal (WhatsApp / otros).** Desbloqueo de alcance x4-5. No es sexy, es la palanca de reach.
4. **Densidad geográfica.** Ganar un valle entero antes que estar disperso en 24 provincias.

### Dónde NO hay potencial (congelado en backlog)
- **Drones** ($100k–330k, regulación ANAC BVLOS). Shiny object. Quema foco. Archivado hasta tener ingresos + equipo.
- **Super-resolución ML** ($22–56k). Ya rechazado con buen criterio (`scripts/super-res-research/REPORT.md`). Muerto.
- **Más fuentes satelitales** (MODIS, Sentinel-3, MTG, EUMETSAT). Rendimientos decrecientes; commodity; GOES ya resolvió la latencia.
- **Tiers Enterprise B2G** ($3.000/mes, on-premise). Ficción de spreadsheet sin un solo design partner.

---

## 5. Plan priorizado (esto es lo que vamos a seguir)

> Principio: una cosa a la vez, la de más leverage. P0 son fundaciones baratas que desbloquean todo. P1 es el corazón (distribución). El resto sigue.

### 🔴 P0 — Fundaciones (esta/próxima semana, baratas, desbloquean el resto)
- [ ] **Confirmar números reales en Supabase.** Cuántos `subscribers` hay hoy, cuántos `fireman`, alertas entregadas reales, comandos en `bot_commands_log`. Dejar de planear a ciegas. *(ref: project qmzuwnilehldvobjsbcs)*
- [ ] **Instrumentación mínima de origen.** Agregar columna `source text` en `subscribers` (qué cuartel / posteo / radio trajo cada alta). Es lo que va a enseñar qué canal funciona. Barato.
- [ ] **Dead-man's-switch externo (watchdog).** Healthchecks.io (free) que espera un ping al final de cada ciclo exitoso de `/api/goes-alerts` y `/api/alerts`; si no llega en ~20 min, avisa por Telegram + email. *(detalle en sección 7)*
- [ ] **Limpieza SatAI.** Renombrar referencias al nombre viejo. *(lista en sección 6)*

### 🟠 P1 — Canal de distribución (el corazón del go-to-market)
- [ ] **Elegir UNA geografía de arranque** con potencial de densidad: Comarca Andina (El Bolsón/Bariloche), Sierras de Córdoba (Punilla/Calamuchita) o Tierra del Fuego. Decisión del owner.
- [ ] **Rediseñar + reactivar el canal bomberos** según el diseño de la sección **5.1** (deep link + aprobación manual 1-click + cuartel como entidad). Esto reemplaza la "Opción C auto-emisión" del `FIREMAN-ONBOARDING-PLAN.md`.
- [ ] **Quick wins del bot** (independientes, mergeable ya): sumar `/soybombero` al `/help`; mejorar el mensaje de `/soybombero` sin args con un link concreto; migrar `cuartel_name` a tabla canónica `cuarteles`.
- [ ] **Conseguir el primer cuartel real** en el valle elegido. Defensa Civil municipal + cuartel + FM local + grupos de vecinos. Objetivo concreto: que 1 cuartel (el jefe) empuje los primeros ~100 civiles del pueblo.
- [ ] **Capturar el primer testimonio N=1** ("me avisó antes que nadie"). Vale más que 1.000 altas pasivas — es munición de difusión.

### 🟡 P2 — El moat (empezar apenas haya usuarios)
- [ ] **Loop de feedback comunitario.** Botones de un toque al pie de cada alerta (Veo humo / Veo fuego / Huelo a quemado / No veo nada / Estoy lejos). *(diseño completo en `FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md`)*
- [ ] **Esquema de datos bien pensado desde el día 1** (no requiere ML aún): `alerta_id, usuario_id, tipo_respuesta, distancia_al_foco, timestamp, hora_local, peso_calculado`. Lo importante hoy es *guardar bien* para poder entrenar más adelante.
- [ ] **Ponderación por reglas** (distancia / hora / cantidad de votos). ML queda para cuando haya volumen.

### 🟢 P3 — Alcance (una vez validado el loop en un valle)
- [ ] **Expansión de canal de comunicación** (WhatsApp Business — WHI-550 — u otro). Multiplica reach. Recién cuando el loop esté validado en la geografía piloto.

### 🔵 P4 — Confianza y responsabilidad
- [ ] **Disclaimer legal + marco** para un servicio del que la gente depende.
- [ ] **Blindar la asimetría ética** en producto ("ante la duda, la alerta queda"; el feedback negativo nunca apaga una alerta automáticamente).
- [ ] **Revocación de firemen** (`/dejarcuartel` o flag para pasar de fireman a civilian sin perder la suscripción).
- [ ] **Hardening adicional** (sección 7): segundo contacto de emergencia, runbook de 1 página, fin de los códigos por SQL a mano.

### ⚪ Backlog congelado
Drones · super-resolución · más fuentes satelitales · tiers enterprise B2G. No tocar hasta tener tracción + ingresos.

---

## 5.1 — Rediseño del canal bomberos (detalle de P1)

> Review founder-mode del flujo actual. El canal bombero es el corazón de P1 (distribución bottom-up), así que tiene que ser impecable.

### El problema de fondo
El producto **modela individuos, cuando la respuesta a incendios es una actividad de UNIDAD.** El que decide, difunde y da credibilidad es el **cuartel (el jefe)** — pero el sistema trata a cada bombero como un individuo aislado que casualmente tiene un código. Esa disonancia es la fricción que se siente.

### El viaje HOY (8 pasos con trampas)
1. Entra a alertaforestal.org → **no dice nada de bomberos**, se va sin enterarse.
2. Consigue un código → ¿cómo? "escribinos" sin link; vos lo creás a mano con SQL.
3. Abre el bot → `/start`.
4. Se suscribe como civil (comparte ubicación).
5. Recién ahí → `/soybombero CÓDIGO` (copiar/pegar en el celular).
6. Si hizo `/soybombero` antes de suscribirse → ⛔ "primero suscribite" (**rebota tu mejor lead**).
7. `/help` no lista `/soybombero` → no se descubre el comando.
8. Dejar el cuartel → `/cancelar` borra TODO (incluida la ubicación).

### Tres síntomas concretos
1. **Trampa de orden.** Tener un código es la acción más comprometida del usuario; lo natural es tipearlo de una. El sistema lo rechaza. **Nunca rebotar un código.**
2. **Código como string para copiar/pegar.** Fricción real en el celular / grupo de WhatsApp.
3. **Cero descubrimiento.** Ni la web ni `/help` mencionan el canal. El jefe —tu multiplicador— es justo el que no se entera.

### Cómo hacerlo (reframe: el cuartel es la unidad, el jefe el campeón, el código es la puerta)
- **A) El código es un deep link de Telegram, no un string.** `https://t.me/alertaforestal_bot?start=cuartel-TOKEN`. El jefe comparte **un link** en el WhatsApp del cuartel; cada bombero lo toca → bot abre → "Sos de Bomberos de {cuartel} 🚒, compartí tu ubicación" → listo. Un toque + ubicación. (Variante C.2 del doc viejo — la correcta para un producto Telegram-first.)
- **B) El código-primero ES el alta.** Si llega por el link o tipea `/soybombero CÓDIGO` en frío, **crear el subscriber y promover en el mismo flujo**; pedir ubicación después. El flujo sigue el modelo mental del bombero, no el orden de las tablas.
- **C) El cuartel como entidad de primera clase.** Tabla `cuarteles` canónica + `fireman_codes.cuartel_id`. Habilita roster, "X bomberos de tu cuartel suscriptos", y atribuir `source` (se conecta con la instrumentación de P0). Hoy `cuartel_name` texto libre ensucia métricas.
- **D) Auto-servicio para el jefe, verificación liviana — NO auto-emisión todavía.** ⚠️ **Desacuerdo con el plan previo:** el `FIREMAN-ONBOARDING-PLAN.md` eligió "Opción C avanzada: auto-emisión con OTP (8-12h)". Con 0 usuarios eso resuelve el problema equivocado (anti-abuso) antes que el real (nadie pide). En su lugar: `/cuarteles` → jefe llena cuartel + provincia → te llega ping a Telegram → **aprobás con 1 click** desde el superadmin → se genera el deep link. Conocer cada cuartel personalmente a esta escala es un **activo**, no un cuello de botella. Automatizar cuando duela.
- **E) Superficie de descubrimiento en la web (lo más urgente).** Teaser en el landing + página `/cuarteles`. Sin esto el canal es invisible para tu multiplicador.
- **F) Gestión de rol sin pérdida de datos.** `/dejarcuartel` → vuelve a civil conservando la ubicación; camino para "cambié de cuartel".
- **G) `/help` lista `/soybombero`.** Trivial, ya.

### El viaje rediseñado (4 pasos sin fricción)
1. Jefe entra a la web → ve "¿Sos bombero voluntario?" → `/cuarteles`.
2. Llena form → te llega ping a Telegram → aprobás con 1 click.
3. Recibe **un** deep link → lo pega en el WhatsApp del cuartel.
4. Cada bombero toca el link → comparte ubicación → **listo** (1 toque).

### Archivos a tocar cuando se implemente
- `src/app/api/bot/telegram/route.ts` — `handleStart` (parsear `start cuartel-TOKEN`), `handleSoyBombero` (línea 473, invertir orden), `/help` (línea ~140).
- `src/app/api/alerts/route.ts:408` (`formatFiremanAlert`) y `:62` (filtro forestal omitido para firemen) — sin cambios de lógica, sólo verificar.
- Nuevas tablas `cuarteles` + `cuartel_requests`; `fireman_codes.cuartel_id`. Schema en `FIREMAN-ONBOARDING-PLAN.md` (fase 1).
- Web: teaser en `src/app/(main)/page.tsx` + nueva `/cuarteles` en route group `(main)`.

---

## 6. Limpiezas necesarias

### Rename SatAI → AlertaForestal (nombre viejo, eliminar referencias)
- [ ] `src/lib/dispersion.ts:3` — comentario *"Adapted from SatAI — generalized for any location in Argentina."*
- [ ] `src/components/city/city-map.tsx:181` — comentario *"Data panel — left side, SatAI style"*
- [ ] `CLAUDE.md:9` y `CLAUDE.md:18` — *"shared with SatAI"* → aclarar que es el nombre viejo del propio proyecto (no infra compartida), p.ej. "(proyecto Supabase creado originalmente bajo el nombre viejo SatAI)".
- [ ] Re-grep antes de cerrar: `grep -rin "satai" --include="*.ts" --include="*.tsx" --include="*.md" . | grep -v node_modules` por si quedó alguna.

### Tech-debt / coherencia de docs
- [ ] Reconciliar `COSTOS_ALERTAFORESTAL.md` y `PLAN_ACCION_ALERTAFORESTAL.md` con la decisión confirmada (B2C civil gratis; B2G = exploración futura, no foco). Hoy ambos asumen un negocio B2G que no es la prioridad.
- [ ] Marcar en esos docs qué es "decisión vigente" vs "exploración archivada" para no volver a planear sobre supuestos viejos.

---

## 7. Cómo hacer las dos cosas que preguntaste

### A) "¿Cómo instrumento la verdad sin usuarios?"
Con 0 usuarios, instrumentar **no es analytics, es medir experimentos de distribución.** No importa DAU/retención todavía; importa *qué canal trae los primeros 100 vecinos en una zona de riesgo y cuáles vuelven cuando hay un foco real.*

1. **Una sola geografía** (densidad > dispersión). El loop comunitario y el boca-a-boca sólo prenden con masa local crítica.
2. **El canal es humano: los cuarteles.** Bombero = canal + validador + credibilidad. 1 cuartel → empuja a todo el pueblo. Por eso fireman onboarding es lo de mayor leverage.
3. **Instrumentar barato desde el usuario cero:** columna `source` en `subscribers` + lo que ya se loguea (`bot_commands_log`). Las 3 métricas pre-tracción: **origen de cada alta**, **alertas entregadas a gente real**, **N=1 que actuó**.
4. **Sembrar, no esperar orgánico:** Defensa Civil, FM local, grupos de vecinos, cuartel. Pre-temporada es la ventana.

### B) "Endurecé la operación: ejemplo concreto" → Dead-man's-switch externo
El peor modo de falla de un servicio de seguridad es el **silencioso**: el pipeline se cae y nadie se entera hasta que alguien no recibe la alerta de un incendio real. Problema del alerting actual ("snapshot stuck en 0"): **el mismo sistema que se cae es el que tiene que avisar que se cayó.**

Solución: un servicio *externo* espera un "ping" periódico; si no llega, **él** te grita. No depende de que tu infra esté viva.

```
Healthchecks.io (free)  ──  espera ping cada ~20 min
        ▲
        │  fetch(PING_URL) al final de cada ciclo EXITOSO
        │
goes-alerts / fires-alerts  ── "terminé OK" ──► ping
        │
        └─ si NO llega en 20 min → Telegram + email:
           "🔴 AlertaForestal: pipeline caído hace 25 min"
```

Implementación (1-2h):
1. Cuenta gratis en Healthchecks.io; check con período 15-20 min + grace 5 min.
2. Al final de `/api/goes-alerts` y `/api/alerts`, **sólo en el path de éxito** (no en el catch), `fetch(HEALTHCHECK_PING_URL)`. Si la ruta falla → no pinga → salta solo.
3. Conectar el alerting de Healthchecks a Telegram personal + email.

Por qué primero: es la diferencia entre "me enteré en 20 min y lo levanté" vs "me enteré por un vecino enojado tras un incendio".

Hardening siguiente (en orden, no todo ahora): segundo contacto de emergencia (bus factor) · runbook de 1 página · sacar la emisión de códigos de bombero del SQL manual.

---

## 8. Preguntas / decisiones abiertas para el owner
- [ ] **¿Qué geografía piloto?** (Comarca Andina / Sierras de Córdoba / Tierra del Fuego).
- [ ] **Fireman onboarding:** ¿provider de email (Resend?), sub-variante C.1 vs C.2 vs C.3, `max_uses` default (¿5?), captcha sí/no, `OWNER_CHAT_ID`.
- [ ] **¿AlertaForestal como entidad sin fines de lucro?** (impacta marco legal del punto f).

---

## 9. Referencias en el repo
- `FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md` — diseño completo del moat (cuadrantes, ponderación, esquema).
- `FIREMAN-ONBOARDING-PLAN.md` — flujo actual del rol fireman + opciones de onboarding (pausado).
- `COSTOS_ALERTAFORESTAL.md` — modelo B2G (exploración futura, no foco actual).
- `PLAN_ACCION_ALERTAFORESTAL.md` — roadmap técnico previo (reconciliar con decisiones de este doc).
- `ANALISIS_SATELITES_ALERTAFORESTAL.md` — fuentes de datos evaluadas (la mayoría = backlog congelado).
- `README.md` / `CLAUDE.md` — estado técnico y arquitectura.
- `../whitebay/Proyectos/AlertaForestal/Roadmap-y-Exploraciones.md` — roadmap + exploración drones (congelado).

---

*Próximo paso sugerido: ejecutar P0 (números reales + columna `source` + dead-man's-switch + limpieza SatAI), porque son baratos y desbloquean todo lo demás. Después atacar P1 (canal bombero).*
