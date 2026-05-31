# SPEC — Feedback Comunitario AlertaForestal (Clara)

> Estado: **PROPUESTA PARA APROBACIÓN DEL OWNER**. Nada de esto se aplica hasta el OK explícito. Una sola migración toca producción (tabla `feedback`); el resto es código nuevo no destructivo.
> Fuentes verificadas en repo: `src/app/api/alerts/route.ts`, `src/app/api/goes-alerts/route.ts`, `src/app/api/bot/telegram/route.ts`, `src/lib/telegram.ts`, `FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md`, `CLAUDE.md`. Las byte-lengths fueron re-derivadas analíticamente del BBOX Argentina + `buildFireKey` real.

---

## 1. Objetivo y principio rector

**Objetivo.** Convertir cada alerta de Telegram en una oportunidad de validación comunitaria de un solo toque, y persistir esos votos con un esquema entrenable, para construir el dataset propio de eventos validados (el moat frente a Satellites On Fire). NO es ML hoy; es captura limpia hoy, ponderación después.

**Principio rector (no negociable).** *El feedback es un sensor de un solo sentido: entra dato, nunca sale decisión.* Ningún voto, ni agregación de votos, puede apagar, suprimir, retrasar ni filtrar el envío de una alerta. La asimetría ética del doc (`FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md:78-80`) es el invariante arquitectónico de §5. Es un servicio de seguridad: la captura debe ser a prueba de balas y **jamás** romper el path de envío. Si la captura falla, la alerta se manda igual.

---

## 2. Modelo de datos

### 2.1 `alert_id` — identidad estable de la alerta (CONTRATO MAESTRO)

Las tres frentes proponían formatos distintos. **Decisión única reconciliada:**

```
alert_id := "<src>:<native_key>"
  src ∈ { "f", "g" }
  FIRMS:  "f:" + fire_key      donde fire_key = `${lat.toFixed(3)}_${lng.toFixed(3)}_${acqDate}`
  GOES:   "g:" + goes_preliminary.id   (bigint como texto)
```

Ejemplos reales:
- `f:-38.748_-68.920_2026-04-09` (28 bytes)
- `g:4336` (6 bytes hoy)

**Conflictos resueltos:**

| Punto en disputa | Frente A | Frente C | DECISIÓN |
|---|---|---|---|
| GOES native key | `goes_preliminary.id` | `goes_alerted.id` (surrogate por-envío) | **`goes_preliminary.id`**. Es el handle del *foco*, no del envío. Ambos están en scope en el send-path (`goes-alerts/route.ts:99` `det.id` y `:109-113` `claimed.id`). Usar el del foco mantiene `alert_id` reconstruible y permite cruzar a posteriori con qué detectó el satélite (cuadrantes 1/2). El `goes_alerted.id` por-envío se evapora si un dismissal cascade-borra la fila — y además mezclaría identidad-de-foco con identidad-de-mensaje. |
| ¿chat_id dentro del alert_id? | No | Sí (`F:fire_key:chat_id`) | **No.** El chat_id viene firmado por Telegram en `callback_query.from.id` y es `== subscribers.chat_id`. Meterlo en el alert_id desperdicia bytes y permitiría spoofing. El alert_id identifica el **foco**, no el par (foco, usuario). |
| Prefijo de fuente | `f:` / `g:` | `F:` / `G:` | **`f:` / `g:` minúscula**, espejado en columna `alert_source` (`'firms'`/`'goes'`). |

> Nota de grounding: la cita de Frente A "src/lib/firms.ts:201-203" es un error de etiqueta — `buildFireKey` vive en **`src/app/api/alerts/route.ts:201-203`** (verificado). El BBOX que acota el ancho sí está en `src/lib/firms.ts`.

### 2.2 Budget de `callback_data` (Telegram = 64 bytes UTF-8, límite duro)

**Frente C afirmaba que el fire_key entero no entra en 64 bytes y proponía un hash corto / tabla de mapeo / columna surrogate en `ai_alerted_fires`. Esa premisa es FALSA y queda descartada.** Medición re-confirmada:

- `fire_key` está acotado a **26 bytes** por el BBOX Argentina (`src/lib/firms.ts:31-36`: lat∈[-55.1,-21.8], lng∈[-73.6,-53.6] ⇒ siempre `-NN.NNN` = 7 chars × 2 + 2 underscores + `YYYY-MM-DD` 10 chars = 26). `toFixed(3)` fija el ancho; nunca crece.
- `"f:" + fire_key` = **28 bytes**. GOES `g:<id>` ≤ 21 bytes en el techo teórico del bigint.

**Formato de `callback_data` (decisión única):**

```
callback_data := "fb|<alert_id>|<v>"
  prefijo "fb"  → namespace de feedback (distingue de futuros callbacks)
  v ∈ { s, f, q, n, l }   // s=veo humo, f=veo fuego, q=huelo a quemado, n=no veo nada, l=estoy lejos
```

Se adopta el **prefijo legible `fb`** de Frente A (más auto-documentado que `v`) y los **códigos de voto de 1 char** de Frente B/C (margen extra y sin riesgo de que un voto contenga `|`). `s` para humo (no `h`) evita ambigüedad mnemónica con "humo/fuego"; mapeo explícito abajo.

**Peor caso (FIRMS + cualquier voto):** `"fb|"` (3) + `"f:-38.748_-68.920_2026-04-09"` (28) + `"|"` (1) + `s` (1) = **33 bytes**. Margen: **31 bytes libres** sobre 64. Cabe siempre, incluso con sufijo de versión `|v1` (36 bytes). **No se necesita hash ni tabla de mapeo ni surrogate id.**

Mapeo código → voto canónico (persistido en la tabla):

| código | botón (label) | `response` en DB |
|---|---|---|
| `s` | 💨 Veo humo | `humo` |
| `f` | 🔥 Veo fuego | `fuego` |
| `q` | 👃 Huelo a quemado | `olor` |
| `n` | 🚫 No veo nada | `nada` |
| `l` | 📍 Estoy lejos | `lejos` |

### 2.3 DDL propuesto — tabla `feedback` (NO aplicar aún)

Una sola tabla, **append-only** (resuelve el dilema upsert-vs-append de las tres frentes a favor de append). Sin tabla `alerts` canónica ni FK duras.

```sql
create table public.feedback (
  id            bigint generated always as identity primary key,
  alert_id      text   not null,            -- "f:<fire_key>" | "g:<goes_preliminary.id>"
  alert_source  text   not null
                       check (alert_source in ('firms','goes')),  -- espejo del prefijo, para filtrar sin parsear
  chat_id       bigint not null,            -- = subscribers.chat_id = callback_query.from.id (firmado por Telegram)
  response      text   not null
                       check (response in ('humo','fuego','olor','nada','lejos')),

  -- Contexto capturado AL MOMENTO DEL ENVÍO de la alerta (snapshot inmutable; ver §6.2):
  distance_km   double precision,           -- haversine(subscriber, foco) que vio el usuario; nullable si no se pudo resolver
  fire_lat      double precision,           -- snapshot del foco (FIRMS o GOES)
  fire_lng      double precision,
  sub_lat       double precision,           -- snapshot del subscriber al momento del envío
  sub_lng       double precision,
  frp           double precision,           -- señal satelital del momento (FIRMS frp / GOES frp_mw); nullable
  local_hour    smallint,                   -- hora local 0-23 (Argentina UTC-3 fijo, sin DST); nullable

  -- Reservado para la fase de ponderación (LATER, §6.3); nullable hasta entonces:
  weight        double precision,           -- NULL = todavía no ponderado

  responded_at  timestamptz not null default now(),  -- UTC server-side, momento del TAP
  created_at    timestamptz not null default now()
);

-- Append-only: NO unique(alert_id, chat_id). Se guardan TODOS los votos para no
-- perder la trayectoria temporal ("nada" → "humo" 30 min después), que el doc
-- valora explícitamente (FEEDBACK_..:49, cuadrante "confirmación tardía").
-- El "voto vigente" se resuelve en la capa de análisis:
--   distinct on (alert_id, chat_id) ... order by alert_id, chat_id, responded_at desc
create index feedback_alert_idx  on public.feedback (alert_id);
create index feedback_chat_idx   on public.feedback (chat_id);
create index feedback_recent_idx on public.feedback (alert_id, responded_at desc);

alter table public.feedback enable row level security;
-- Sin policies para anon/auth: bloqueados (patrón del proyecto, CLAUDE.md §Seguridad).
-- Solo service_role escribe, desde el webhook server-side. service_role bypassa RLS.
```

**Por qué NO hay tabla `alerts` canónica ni FK duras** (las tres frentes coinciden, lo consolido):
1. **FIRMS no tiene PK por foco citable.** Los focos viven en `fires_cache` como JSONB single-row (`id=1`) que se **reemplaza** en cada sync (`CLAUDE.md`). No hay a qué apuntar.
2. **GOES borra preliminaries.** `goes_preliminary` se DELETEa en dismissals (cascade a `goes_alerted`). Un FK `ON DELETE CASCADE` borraría feedback histórico — lo opuesto a "guardar bien los datos". Por eso `alert_id` es TEXT libre + snapshot lat/lng/frp en la fila: el voto es **autocontenido** y sobrevive a cualquier prune del lado operativo.
3. El feedback es un **log de observación**, no una entidad transaccional. Desacoplarlo lo protege de `goes-dismissals` / `goes-prune`.

Mapeo a los campos pedidos por el doc (`FEEDBACK_..:106`): `alerta_id→alert_id` (+`alert_source`), `usuario_id→chat_id`, `tipo_respuesta→response`, `distancia_al_foco→distance_km`, `timestamp→responded_at`, `hora_local→local_hour`, `peso_calculado→weight` (NULL).

---

## 3. Protocolo del bot

### 3.1 Inline keyboard (5 botones, 3 filas, solo civilian)

```
[ 🔥 Veo fuego ]     [ 💨 Veo humo ]
[ 👃 Huelo a quemado ]
[ 🚫 No veo nada ]   [ 📍 Estoy lejos ]
```

- "Huelo a quemado" en fila propia (`FEEDBACK_..:48`: el olfato llega antes/de noche).
- "No veo nada" y "Estoy lejos" separados (`FEEDBACK_..:47`): "lejos" no es voto válido sobre el foco; **se guarda igual** (`response='lejos'`) para medir cobertura geográfica, pero se excluye del cálculo de ponderación.
- **Solo civilian.** El fireman recibe formato operativo "datos crudos, validá antes de despachar" (`formatFiremanAlert` / `formatFiremanPreliminary`); su validación es el despacho, no un botón. Mezclar voto de bombero (autoridad alta) con voto de vecino (señal ruidosa a ponderar) contaminaría el dataset. El teclado se adjunta **solo en la rama `!isFireman`** (`alerts/route.ts:129-133`, `goes-alerts/route.ts:131-133`).

`reply_markup.inline_keyboard` se pasa como 3er arg a `sendMessage(chatId, text, extra)` — `extra` ya se spreadea en el body (`src/lib/telegram.ts:5-23`) y ya hay precedente de `reply_markup` en `/start` (`bot/telegram/route.ts:178-184`). **No hace falta tocar `telegram.ts` para enviar.**

### 3.2 `callback_data`

Formato §2.2: `fb|<alert_id>|<v>`. Construido **en el punto de envío** (no en el webhook):
- FIRMS (`alerts/route.ts:140`): `alert_id = "f:" + fireKey` (ya disponible en `fireKey`, `:53`).
- GOES (`goes-alerts/route.ts:135`): `alert_id = "g:" + det.id` (`det.id` = `goes_preliminary.id`, `:99/:111`).

### 3.3 Handler del webhook (código nuevo)

`TelegramUpdate` hoy solo modela `.message` (`bot/telegram/route.ts:18-25`); un `callback_query` cae al manejo de `message` con `chat` undefined y se descarta como `{ok:true}`. **Hay que bifurcar ANTES** del lectura de `update.message`:

1. Extender la interface:
   ```ts
   interface TelegramUpdate {
     message?: { ... };  // existente
     callback_query?: {
       id: string;
       from: { id: number };
       message?: { message_id: number; chat: { id: number } };
       data?: string;
     };
   }
   ```
2. Rama nueva, **antes** de la línea que lee `update.message?.chat.id`:
   ```ts
   if (update.callback_query) {
     return await handleVote(update.callback_query);  // siempre responde {ok:true}
   }
   ```
3. `handleVote`:
   - `answerCallbackQuery` **en TODOS los branches** (incluso error/inválido) para quitar el spinner del botón. Sin esto el botón queda colgado.
   - Parsear `data.split("|")` → `["fb", alert_id, v]`. Validar prefijo `fb`, `v ∈ {s,f,q,n,l}`, `alert_id` empieza con `f:` o `g:`. Si algo no valida → `answerCallbackQuery` neutro y return.
   - `chat_id = callback_query.from.id`. Verificar que sea subscriber (`subscribers` por `chat_id`); si no lo es (mensaje reenviado a un no-suscriptor) → no contar.
   - Resolver contexto (§6.2): leer snapshot reconstruible y `INSERT` (append) en `feedback` con `alert_source` derivado del prefijo.
   - `answerCallbackQuery(callback_query.id, "Gracias, registrado 🙏")` — toast no intrusivo, tono que **no desaliente** ningún voto (incluido "nada").
   - Loguear en `bot_commands_log` (`command="vote:<v>"`, patrón append-only existente).
4. **Toda la operación del handler está envuelta en try/catch que SIEMPRE devuelve `{ok:true}`.** Un fallo de captura nunca debe hacer que Telegram reintente el webhook ni propagar error.

### 3.4 Helpers nuevos en `src/lib/telegram.ts`

```ts
answerCallbackQuery(callbackQueryId: string, text?: string, showAlert?: boolean): Promise<void>
editMessageReplyMarkup(chatId: number, messageId: number, replyMarkup: object): Promise<void>  // opcional, §3.6
```
Mismo patrón que `sendMessage` (fetch a `api.telegram.org/bot<token>/...`). **No cambia la firma de `sendMessage`** — `extra` sigue spreadeándose.

### 3.5 Dedup, ventana y abuso

- **Append-only**, no upsert (§2.3). El "voto vigente" es `distinct on (alert_id, chat_id) order by responded_at desc`. Cambiar de opinión = tocar otro botón = nueva fila; la trayectoria queda registrada.
- **Ventana de respuesta: ABIERTA.** El doc pide capturar feedback tardío (`FEEDBACK_..:49`). Los inline keyboards de Telegram no expiran solos; no editamos el mensaje, el teclado queda vivo indefinidamente. (Decisión abierta §7: si se quiere un cutoff de cordura, p.ej. 24h, se chequea `responded_at - alert_sent_at` — pero hoy no guardamos `alert_sent_at` accesible; ver §7.)
- **Anti-abuso:** `from.id` lo firma Telegram (no spoofeable) y el secret-token del webhook cubre requests forjadas. Como es append-only, el spam de un botón infla filas pero el análisis siempre toma el último voto por usuario, así que no distorsiona el resultado. **Rate-limit recomendado pero diferible:** ignorar votos del mismo `(chat_id, alert_id)` separados < 30s (cooldown en memoria o por `responded_at` de la última fila). Ver §7.

### 3.6 UX

Toast vía `answerCallbackQuery` ("Gracias, registrado 🙏"). **No se edita el cuerpo del mensaje** (preserva la asimetría ética: el mensaje nunca cambia de estado por un voto). Opcionalmente, `editMessageReplyMarkup` para marcar con ✓ el botón elegido — diferible, requiere `message_id` (ver §7).

---

## 4. Integración en las alertas (file:line)

| Archivo | Línea | Cambio |
|---|---|---|
| `src/lib/telegram.ts` | 5-23 | `sendMessage` **sin cambios** (ya soporta `extra`). Agregar `answerCallbackQuery` y (opcional) `editMessageReplyMarkup`. |
| `src/app/api/alerts/route.ts` | 140 | Adjuntar `reply_markup` (3er arg de `sendMessage`) **solo en rama civilian** (`!isFireman`). `alert_id = "f:" + fireKey` (`fireKey` ya en `:53`). Aplica a `formatAlert` y `formatConfirmedFromPreliminary` (ternario `:129-133`). |
| `src/app/api/goes-alerts/route.ts` | 135 | Adjuntar `reply_markup` **solo en rama civilian** (`:131-133`). `alert_id = "g:" + det.id` (`det.id` = `goes_preliminary.id`, `:99/:111`). |
| `src/app/api/bot/telegram/route.ts` | 18-25, ~62 | Extender `TelegramUpdate` con `callback_query`; bifurcar a `handleVote` **antes** del manejo de `message`. |

El teclado se construye una vez en un helper compartido (p.ej. `src/lib/feedback-keyboard.ts`: `buildFeedbackKeyboard(alertId): { inline_keyboard: ... }`) para no duplicar la matriz de botones entre los dos call-sites.

---

## 5. Asimetría ética (safeguard concreto) + matriz 4 cuadrantes

### 5.1 Safeguard arquitectónico (separación física de caminos de escritura)

1. **`feedback` es tabla de SOLO INSERT.** El handler de voto tiene como única escritura un `insert` sobre `feedback`. **No** importa, lee ni escribe `ai_alerted_fires`, `goes_alerted`, `goes_preliminary`, `fires_cache`, ni ninguna lógica de envío. Un voto físicamente no puede tocar el estado de una alerta.
2. **El dismissal de GOES sigue 100% satelital.** `dismissed_at` lo setea `/api/goes-dismissals` por **ausencia de confirmación FIRMS en 4h** (`CLAUDE.md`), nunca por feedback. Invariante escrito: *el voto humano nunca es input de un dismissal ni de un DELETE de `goes_preliminary`.* Respaldado por `FEEDBACK_..:74-76`.
3. **Cuadrante 2 ("nada" consistente) → solo señal mostrada, NUNCA acción.** Lo máximo es que la agregación (LATER) calcule un `confidence_level` que el bot muestre como **texto** ("foco detectado, sin confirmar" vs "confirmado por vecinos", `FEEDBACK_..:84`). Ese nivel **no** filtra ni suprime envío. El gate de `/api/alerts` y `/api/goes-alerts` sigue siendo solo el actual (distancia, viento, forestZone, FRP/scans); `feedback` nunca entra como `if`/`continue`/skip.
4. **Test anti-regresión (a futuro):** contract test que verifique que ningún send-path lee de `feedback`, análogo al guard ESLint del ecosistema. Notado para el frente de tests.

**El botón es un sensor de un solo sentido: entra dato, nunca sale decisión.**

### 5.2 Matriz de 4 cuadrantes (`FEEDBACK_..:63-70`)

| Satélite | Humanos | Interpretación |
|---|---|---|
| **Detecta** | **Confirman** (humo/fuego/olor, cerca, de día) | **Verdadero positivo.** Etiqueta de oro. Guardar con todo el contexto. |
| **Detecta** | **Cercanos y creíbles dicen "nada" consistentemente** | **Posible falso positivo** (ruido térmico). **NUNCA apaga la alerta**; solo baja confianza mostrada y marca para revisión. |
| **No detecta** | **Reportan humo** | **El más valioso y delicado.** Foco que el satélite no vio aún → alerta temprana. **No entra por estos botones** (no hay alerta previa); feature aparte (§6.4). |
| **No detecta** | **No reportan** | Normal. |

---

## 6. Build NOW vs LATER

### 6.1 BUILD NOW (alcance de este spec)
- Migración tabla `feedback` (§2.3).
- Helper `buildFeedbackKeyboard` + adjuntar `reply_markup` solo civilian en los 2 send-paths (§4).
- Helpers `answerCallbackQuery` (+ opcional `editMessageReplyMarkup`) en `telegram.ts`.
- Rama `callback_query` + `handleVote` en el webhook, con captura blindada y `{ok:true}` siempre (§3.3).
- Log en `bot_commands_log`.

### 6.2 Captura de contexto AHORA (cómo, decisión reconciliada)
**Snapshot al momento del ENVÍO**, persistido en la fila de `feedback` cuando llega el voto. Las tres frentes coincidían en "snapshot, no join vivo"; resuelvo el sub-punto "qué instante":

- **`distance_km`, `fire_lat/lng`, `sub_lat/lng`, `frp` = el valor que el usuario VIO en la alerta** (instante del envío), no recomputado al votar. Razón: la distancia que el usuario juzga al votar es la que leyó en el mensaje; recomputar al votar puede diferir si el foco FIRMS ya desapareció del cache. Como esos valores NO caben en `callback_data` (64 bytes) y NO existe hoy una fila de envío con todos los campos (FIRMS guarda solo `(fire_key, chat_id, alerted_at)`; GOES vive en `goes_preliminary` que se borra), la estrategia robusta es:
  - **El send-path conoce todos los valores** (`distKm` en `alerts/route.ts:79` y `goes-alerts/route.ts:104`; lat/lng del foco y del sub; `frp`). Para hacerlos recuperables al votar sin meterlos en el callback_data, el handler **reconstruye** lo reconstruible y **recomputa** lo barato:
    - `fire_lat/lng` FIRMS: **embebidos en el `fire_key`** (`${lat}_${lng}_${acqDate}`) → se parsean del propio `alert_id`. Exacto, sin join.
    - `fire_lat/lng` + `frp` GOES: leer `goes_preliminary` por el id del `alert_id`; si ya se borró (dismissal), quedan NULL (aceptable — el voto igual se guarda).
    - `sub_lat/lng`: leer `subscribers` por `chat_id` (siempre disponible).
    - `distance_km = haversineKm(sub, fire)` con esos valores (la fn ya está importada en ambos send-paths y se reusa en el webhook). Diferencia vs el valor mostrado: despreciable (el sub no se movió entre recibir y votar) y el resultado queda congelado en la fila.
  - `local_hour = (new Date().getUTCHours() + 24 - 3) % 24` (Argentina UTC-3 fijo, sin DST). No requiere geocoding.
- **Regla de oro:** todo lo necesario para entrenar vive **en la fila de `feedback`** (snapshot), no en joins que pueden evaporarse (`goes_preliminary` se borra).

### 6.3 LATER — Ponderación por reglas (DIFERIDA; necesita volumen)
> ⚠️ NO implementar ahora. Con ~1 subscriber no hay señal (`FEEDBACK_..:59`). Spec para cuando haya volumen:
- `weight ∈ [0,1]` multiplicativo: `w_dist = clamp(1 - dist_km/15, 0, 1)`; factor hora (10–17h≈1.0, crepúsculo≈0.5, noche≈0.1) **salvo `response='olor'`** que ignora la hora (`FEEDBACK_..:48`); mínimo de observadores creíbles (p.ej. ≥3 con `w_dist>0.3` en ~2h) antes de concluir nada.
- `response='lejos'` se guarda pero se **excluye** del cálculo (`FEEDBACK_..:47`).
- Job: cron horario que rellena `weight` y agrega un `confidence_level` por `alert_id`. Solo alimenta **texto mostrado**, nunca el gate de envío (§5).
- Umbrales (15 km, mínimo de votos) → decisión abierta del doc (`:107`).

### 6.4 LATER — Cuadrante 3 (reportar humo SIN alerta previa) → FEATURE APARTE
- Por definición no tiene `alert_id`, no entra por estos botones. Requiere vía propia (`/reporto` o botón persistente "🚨 Reportar humo cerca mío") + tabla separada `community_reports` (sin `alert_id`).
- Delicado (`FEEDBACK_..:67`): la señal más valiosa pero más propensa a abuso. Necesita anti-spam, rate-limit y cruce con la siguiente pasada GOES/FIRMS sobre esa coordenada para auto-etiquetar. **Ticket aparte, fuera de alcance.**

### 6.5 LATER — ML
Cuando haya volumen de filas etiquetadas (`FEEDBACK_..:100`). Hoy nada.

---

## 7. Riesgos y decisiones abiertas para el owner

1. **Ventana de respuesta / cutoff.** Decisión: ventana ABIERTA (botón vivo indefinidamente). ¿Querés un cutoff de cordura (p.ej. 24h)? Hoy no guardamos un `alert_sent_at` accesible desde el voto (FIRMS no lo persiste con lat/lng; GOES se borra). Implementarlo requeriría una columna o tabla de "mensajes enviados". **Recomendación: dejar abierto, no agregar estado ahora.**
2. **`message_id` para feedback visual.** Marcar el botón elegido con ✓ (`editMessageReplyMarkup`) necesita `message_id`, que hoy ni `ai_alerted_fires` ni `goes_alerted` guardan. **Recomendación: usar solo el toast de `answerCallbackQuery` ahora; diferir el ✓.**
3. **Rate-limit explícito.** El append-only + "último voto gana" tolera spam sin distorsión, pero infla filas. ¿Agregar cooldown 30s por `(chat_id, alert_id)`? **Recomendación: sí, barato y conservador.**
4. **Privacidad de guardar `distance_km` + `sub_lat/lng`.** Ya guardamos lat/lng en `subscribers` (es un servicio de geolocalización por diseño). El snapshot en `feedback` es el mismo dato, congelado. No introduce PII nueva, pero **multiplica las copias** de ubicación. ¿Conviene guardar solo `distance_km` + bucket de zona en vez de lat/lng crudos del sub? Trade-off: lat/lng crudos son necesarios para re-ponderar con fórmulas futuras (§6.3). **Recomendación: guardar crudos; el proyecto ya tiene RLS service-role-only.**
5. **`alert_source` redundante con el prefijo.** Es derivable de `alert_id[0]`. Lo dejo como columna explícita para queries baratas (índice/partición sin parsear texto). ¿OK la redundancia controlada? **Recomendación: sí.**
6. **Cómo se comunica el `confidence_level`** (`FEEDBACK_..:108`): ¿en el mensaje, en `/estado`, o ambos? Diferido a la fase LATER; no bloquea NOW.
7. **Cuadrante 3 como ticket separado** — confirmar que queda fuera de este alcance.

---

## 8. Plan de implementación (pasos)

> Toca producción **una sola vez**: la migración de `feedback`. El resto es código nuevo aditivo.

1. **Migración DB** (único cambio destructivo-cero en prod): crear tabla `feedback` (§2.3) + índices + RLS habilitado sin policies anon/auth. Vía `apply_migration` sobre el project ref del proyecto. Verificar con `list_tables` que quedó RLS-on y service-role-only.
2. **`src/lib/feedback-keyboard.ts`** (nuevo): `buildFeedbackKeyboard(alertId)` → `{ inline_keyboard: [...] }` con los 5 botones / 3 filas y `callback_data = "fb|"+alertId+"|"+code`.
3. **`src/lib/telegram.ts`**: agregar `answerCallbackQuery` (y opcional `editMessageReplyMarkup`). No tocar `sendMessage`.
4. **`src/app/api/alerts/route.ts:140`**: 3er arg `reply_markup` solo en rama civilian; `alert_id = "f:"+fireKey`.
5. **`src/app/api/goes-alerts/route.ts:135`**: ídem; `alert_id = "g:"+det.id`.
6. **`src/app/api/bot/telegram/route.ts`**: extender `TelegramUpdate`; bifurcar `callback_query → handleVote` antes del manejo de `message`; `handleVote` con captura blindada (try/catch → siempre `{ok:true}`), `answerCallbackQuery` en todos los branches, INSERT append en `feedback`, snapshot reconstruido (§6.2), log en `bot_commands_log`.
7. **Verificación E2E** (sin tocar prod del cron): inyectar foco sintético (`TESTING.md`), recibir alerta civilian con teclado, votar cada botón, confirmar 1 fila por tap en `feedback` con snapshot correcto y `responded_at`. Verificar que fireman NO recibe teclado. Verificar que un callback inválido devuelve `{ok:true}` y no inserta.
8. **Tests**: unit del parser de `callback_data` (incluye peor caso 33 bytes y rechazo de `alert_id` malformado), unit del cómputo `local_hour`, y (a futuro) el contract test anti-regresión de §5.1.

---

## 9. Self-critique — qué podría salir mal

- **Race / doble envío del cron infla feedback:** no aplica al feedback (append-only, último voto gana). Pero si el mismo `alert_id` se le manda 2 veces al mismo sub por una race del cron de envío, el usuario ve 2 teclados con idéntico `callback_data` — vota en cualquiera, todo cae en la misma `(alert_id, chat_id)`, sin daño.
- **Webhook reintentos de Telegram:** si `handleVote` tira excepción y devolvemos error, Telegram reintenta y duplica filas. **Mitigado**: try/catch que SIEMPRE devuelve `{ok:true}`. Riesgo residual: un voto que falló al insertar se pierde silenciosamente (aceptable para seguridad — preferimos perder un voto que romper el webhook o duplicar).
- **`answerCallbackQuery` olvidado en algún branch:** el botón queda "cargando" para siempre. **Mitigado** por la regla "answer en TODOS los branches"; cubrir con test.
- **Abuso / spam de botón:** firmado por Telegram (no spoofeable) + append-only tolerante. Riesgo: crecimiento de filas. **Mitigado** por cooldown 30s recomendado (decisión abierta §7.3).
- **`callback_data` > 64 bytes:** descartado por medición (peor caso 33 bytes). Riesgo solo si alguien cambia `buildFireKey` para emitir más decimales o sale del BBOX Argentina. **Mitigación**: test que assert `callback_data ≤ 64` y comentario en `buildFeedbackKeyboard`.
- **Mensaje editado/borrado rompe el voto:** si Telegram borró el mensaje, el callback puede no llegar; si llega, `callback_query.message` puede ser undefined — por eso `handleVote` NO depende de `message`, solo de `from.id` + `data`. El feedback visual `editMessageReplyMarkup` (diferido) sí dependería de `message_id` y fallaría silenciosamente si el mensaje no existe; por eso se difiere.
- **GOES preliminary ya borrada al votar:** `fire_lat/lng`/`frp` GOES quedan NULL. **Aceptable**: el voto, `alert_id`, `distance_km` (si el sub lat/lng alcanza para recomputar contra coords parseadas... no para GOES) y `responded_at` se guardan igual. Para GOES, si se borró el preliminary, `distance_km` también queda NULL. Trade-off conocido; el dataset marca esos casos como "contexto parcial".
- **Privacidad:** se multiplican copias de ubicación del subscriber en cada voto. RLS service-role-only lo contiene, pero es superficie adicional. Decisión abierta §7.4.
- **Reconciliación equivocada del GOES id:** elegí `goes_preliminary.id` sobre `goes_alerted.id`. Si en el futuro el producto quiere distinguir *envíos* (no *focos*) — p.ej. dos preliminaries del mismo foco en scans distintos — el `alert_id` los unifica. Es el comportamiento deseado hoy (un voto es sobre el *foco*), pero queda anotado como supuesto.
- **`local_hour` asume Argentina UTC-3 fijo:** correcto hoy (sin DST). Si vuelve el DST o hay usuarios fuera de AR, habría que derivar TZ de lng. Bajo riesgo, anotado.

---

Archivos relevantes (todos rutas absolutas):
- `/Users/sebastian/Documents/Development/clara/src/app/api/alerts/route.ts` (FIRMS send-path; `buildFireKey` en :201-203, send en :140, fireman branch :129-133, `distKm` :79)
- `/Users/sebastian/Documents/Development/clara/src/app/api/goes-alerts/route.ts` (GOES send-path; `det.id`=goes_preliminary.id :99/:111, `claimed.id`=goes_alerted.id :109-113, send :135, fireman branch :131-133, `distKm` :104)
- `/Users/sebastian/Documents/Development/clara/src/app/api/bot/telegram/route.ts` (`TelegramUpdate` :18-25 sin `callback_query`; precedente `reply_markup` :178-184)
- `/Users/sebastian/Documents/Development/clara/src/lib/telegram.ts` (`sendMessage` :5-23 spreadea `extra`)
- `/Users/sebastian/Documents/Development/clara/FEEDBACK_COMUNITARIO_ALERTAFORESTAL.md` (doc fuente; botones :37-49, matriz :63-70, asimetría :78-89, pendientes :104-108)
- `/Users/sebastian/Documents/Development/clara/CLAUDE.md` (esquema tablas, dismissals borran goes_preliminary, RLS service-role-only)
