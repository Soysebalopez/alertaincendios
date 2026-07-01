import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage, answerCallbackQuery, editMessageText, escapeHtml } from "@/lib/telegram";
import { parseFeedbackCallback } from "@/lib/feedback-keyboard";
import { buildPreferencesKeyboard, parsePreferencesCallback } from "@/lib/preferences-keyboard";
import { findDangerZone } from "@/lib/danger-zone-match";
import { PREVENTION_PROVINCE_IDS } from "@/lib/fire-danger";
import { geocodeCity } from "@/lib/geocode";
import { fetchFires } from "@/lib/firms";
import { haversineKm } from "@/lib/geo";
import { artHour } from "@/lib/time";
import { log } from "@/lib/logger";

/**
 * POST /api/bot/telegram
 *
 * Telegram webhook for @alertaforestal_bot. El bot se presenta como "Clara",
 * la voz/persona del servicio AlertaForestal.org.
 * Commands: /start, /ciudad <name>, /estado, /cancelar
 * Also accepts shared location (GPS pin).
 */

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    location?: { latitude: number; longitude: number };
    from?: { first_name: string };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Bot not configured" });
  }

  // WHI-XXX — verificación de origen Telegram.
  //
  // Telegram firma cada call al webhook con el header
  // `X-Telegram-Bot-API-Secret-Token` (cuyo valor se setea al registrar el
  // webhook con `setWebhook?secret_token=...`). Sin esta verificación,
  // cualquiera con el chat_id de una víctima podía hacer un POST manual y
  // ejecutar comandos en su nombre (e.g. `/soybombero <code>`, `/cancelar`).
  //
  // Comportamiento si la env var no está seteada: WARN y dejar pasar. Esto es
  // un fallback de transición — una vez seteada en Vercel y re-registrado el
  // webhook con el mismo secret_token, todas las requests del cliente real
  // van a matchear y las request spoofeadas van a fallar con 401.
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const received = request.headers.get("x-telegram-bot-api-secret-token");
    if (received !== expected) {
      // Importante no devolver detalles del header recibido — sería un hint
      // útil para un atacante que está iterando para encontrar la forma de
      // pasar el check.
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  } else {
    // Log explícito en cada call hasta que se configure. El warn vive en
    // Vercel logs; sirve como recordatorio operativo.
    console.warn(
      "[telegram] TELEGRAM_WEBHOOK_SECRET no configurado — webhook acepta requests sin verificar origen. Setealo en Vercel y re-registrá el webhook con setWebhook?secret_token=..."
    );
  }

  // M2 — parse defensivo. Un body no-JSON (o vacío) no debe tirar 500: Telegram
  // reintenta ante 5xx y entraría en loop con basura. Ack con {ok:true}.
  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Voto de feedback comunitario (botón inline). Se maneja ANTES que message y
  // SIEMPRE devuelve {ok:true} — un fallo nunca debe hacer reintentar el webhook.
  if (update.callback_query) {
    const cb = update.callback_query;
    if (parsePreferencesCallback(cb.data)) {
      await handlePreferencesCallback(cb);
    } else {
      await handleVote(cb);
    }
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat.id;
  if (!chatId) return NextResponse.json({ ok: true });

  // Strip a trailing `@botname` from the command token so group-style commands
  // (`/estado@alertaforestal_bot`) still match the exact-equality dispatch.
  const text = (update.message?.text?.trim() || "").replace(
    /^(\/[A-Za-z0-9_]+)@[A-Za-z0-9_]+/,
    "$1"
  );
  const location = update.message?.location;

  try {
    if (text === "/start" || text.startsWith("/start ")) {
      // Deep link t.me/alertaforestal_bot?start=<payload> → "/start <payload>".
      // El payload queda en bot_commands_log; upsertSubscriber lo resuelve a
      // `source` cuando el usuario se suscribe (first-write-wins).
      const startArg = text.startsWith("/start ") ? text.slice(7).trim() : "";
      await logBotCommand(chatId, "/start", startArg || undefined);
      await handleStart(chatId);
    } else if (text === "/help") {
      await logBotCommand(chatId, "/help");
      await handleHelp(chatId);
    } else if (text === "/about") {
      await logBotCommand(chatId, "/about");
      await handleAbout(chatId);
    } else if (text === "/rayos") {
      await logBotCommand(chatId, "/rayos");
      await handleRayosToggle(chatId);
    } else if (text === "/preferencias" || text === "/prevencion") {
      await logBotCommand(chatId, text);
      await handlePreferencesCommand(chatId);
    } else if (location) {
      await logBotCommand(chatId, "<location>");
      await handleLocation(chatId, location.latitude, location.longitude);
    } else if (text === "/ciudad" || text.startsWith("/ciudad ")) {
      // A5 — `/ciudad` sin argumento debe llegar a handleCiudad (que muestra el
      // prompt "escribí tu ciudad"), no caer en "comando no reconocido".
      const arg = text === "/ciudad" ? "" : text.slice("/ciudad ".length).trim();
      await logBotCommand(chatId, "/ciudad", arg);
      await handleCiudad(chatId, arg);
    } else if (text === "/estado") {
      await logBotCommand(chatId, "/estado");
      await handleEstado(chatId);
    } else if (text === "/cancelar") {
      await logBotCommand(chatId, "/cancelar");
      await handleCancelar(chatId);
    } else if (text === "/dejarcuartel") {
      await logBotCommand(chatId, "/dejarcuartel");
      await handleDejarCuartel(chatId);
    } else if (text.startsWith("/soybombero")) {
      const arg = text.replace("/soybombero", "").trim();
      await logBotCommand(chatId, "/soybombero", arg ? "<code>" : "");
      await handleSoyBombero(chatId, arg);
    } else {
      await logBotCommand(chatId, "<unknown>", text.slice(0, 32));
      await sendMessage(
        chatId,
        "Comando no reconocido. Usa /help para ver los comandos."
      );
    }
  } catch (err) {
    log.error({
      event: "bot.command_failed",
      chatId,
      command: text || (location ? "<location>" : "<unknown>"),
      err: err instanceof Error ? err.message : String(err),
    });
    await sendMessage(chatId, "Error interno. Intenta de nuevo en unos minutos.");
  }

  return NextResponse.json({ ok: true });
}

// Footer estándar de mensajes del bot. Clara es la persona/narrador del bot,
// AlertaForestal.org es el sitio del proyecto.
const FOOTER = "\n—\nClara · AlertaForestal.org";

const ABOUT_TEXT =
  "🔥 <b>Clara — Alertas de incendios forestales gratis</b>\n\n" +
  "Soy Clara, el bot de <b>AlertaForestal.org</b> — un proyecto independiente, " +
  "gratuito, hecho en Argentina para que los vecinos de zonas afectadas se " +
  "enteren antes de los incendios y puedan prevenirse.\n\n" +
  "Uso datos de NASA (FIRMS), NOAA y otros servicios públicos para detectar " +
  "focos de calor cerca tuyo y avisarte cuando el viento puede traer humo o " +
  "fuego a tu zona. También alerto por tormentas eléctricas secas — la causa " +
  "#1 natural de incendios forestales.\n\n" +
  "Este proyecto existe gracias al trabajo pionero de Satellites On Fire " +
  "(@satellitesonfire), que demostró que se podía detectar incendios mejor " +
  "que la NASA desde Argentina. Si sos una empresa, gobierno, forestal o " +
  "aseguradora, te recomendamos satellitesonfire.com.\n\n" +
  "AlertaForestal es para vos, vecino de zona de riesgo. Gratis, siempre.\n\n" +
  "Hecho con cariño en Bahía Blanca por Whitebay." +
  FOOTER;

const HELP_TEXT =
  "🔥 <b>Clara — Comandos</b>\n\n" +
  "📍 Compartí tu ubicación (clip 📎 → Ubicación)\n" +
  "🏙 /ciudad &lt;nombre&gt; — suscribirte por ciudad\n" +
  "📊 /estado — focos activos cerca tuyo\n" +
  "⚡ /rayos — activar/desactivar alerta de tormentas secas\n" +
  "🚒 /soybombero &lt;código&gt; — modo bombero (para cuarteles)\n" +
  "🚪 /dejarcuartel — volver a alertas de vecino (bomberos)\n" +
  "ℹ️ /about — sobre el proyecto\n" +
  "❌ /cancelar — eliminar suscripción" +
  FOOTER;

// Feedback comunitario — un tap de botón = un voto (append-only en `feedback`).
// SENSOR DE UN SOLO SENTIDO (asimetría ética, FEEDBACK_COMUNITARIO_SPEC.md §5):
// esta función SOLO inserta en `feedback`; jamás lee ni escribe el estado de una
// alerta (ai_alerted_fires / goes_alerted / goes_preliminary). Todo envuelto para
// responder answerCallbackQuery siempre y nunca romper el webhook.
async function handleVote(cb: {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}) {
  try {
    const parsed = parseFeedbackCallback(cb.data);
    if (!parsed) {
      await answerCallbackQuery(cb.id);
      return;
    }
    const chatId = cb.from.id; // firmado por Telegram = subscribers.chat_id
    const db = getSupabase();

    // Solo cuentan votos de suscriptores reales.
    const { data: sub } = await db
      .from("subscribers")
      .select("lat, lng")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (!sub) {
      await answerCallbackQuery(
        cb.id,
        "Suscribite primero compartiendo tu ubicación 📍"
      );
      return;
    }

    // Reconstruir el snapshot del foco (§6.2). FIRMS: lat/lng embebidos en el
    // fire_key. GOES: leer goes_preliminary (puede haberse borrado → queda null).
    let fireLat: number | null = null;
    let fireLng: number | null = null;
    let frp: number | null = null;
    if (parsed.source === "firms") {
      const m = /^(-?\d+\.\d+)_(-?\d+\.\d+)_/.exec(parsed.alertId.slice(2));
      if (m) {
        fireLat = parseFloat(m[1]);
        fireLng = parseFloat(m[2]);
      }
    } else {
      const goesId = Number(parsed.alertId.slice(2));
      if (Number.isFinite(goesId)) {
        const { data: prelim } = await db
          .from("goes_preliminary")
          .select("lat, lng, frp_mw")
          .eq("id", goesId)
          .maybeSingle();
        if (prelim) {
          fireLat = prelim.lat;
          fireLng = prelim.lng;
          frp = prelim.frp_mw ?? null;
        }
      }
    }

    const distanceKm =
      fireLat != null && fireLng != null && sub.lat != null && sub.lng != null
        ? haversineKm(sub.lat, sub.lng, fireLat, fireLng)
        : null;
    const localHour = artHour(); // Argentina-local hour (B7 — centralized helper)

    await db.from("feedback").insert({
      alert_id: parsed.alertId,
      alert_source: parsed.source,
      chat_id: chatId,
      response: parsed.response,
      distance_km: distanceKm,
      fire_lat: fireLat,
      fire_lng: fireLng,
      sub_lat: sub.lat,
      sub_lng: sub.lng,
      frp,
      local_hour: localHour,
    });

    await logBotCommand(chatId, `vote:${parsed.response}`, parsed.alertId);
    // Toast que no desalienta NINGÚN voto (incluido "no veo nada").
    await answerCallbackQuery(cb.id, "¡Gracias! Tu observación nos ayuda 🙏");
  } catch (e) {
    log.error({
      event: "bot.vote_failed",
      err: e instanceof Error ? e.message : String(e),
    });
    try {
      await answerCallbackQuery(cb.id);
    } catch {
      // best-effort
    }
  }
}

async function handleStart(chatId: number) {
  await sendMessage(
    chatId,
    "🔥 <b>Clara — AlertaForestal</b>\n\n" +
      "Soy Clara, el bot de AlertaForestal.org. Detectamos focos de calor en " +
      "toda Argentina con satélites de NASA (FIRMS) y NOAA (GOES-19) y te " +
      "alertamos por Telegram. También avisamos cuando hay tormenta eléctrica " +
      "seca cerca tuyo.\n\n" +
      "<b>Para empezar:</b>\n" +
      "📍 Enviá tu ubicación (clip 📎 → Ubicación)\n" +
      "🏙 O escribí /ciudad Bariloche\n\n" +
      "<b>Comandos disponibles:</b>\n" +
      "📊 /estado — focos activos en 100 km a tu alrededor\n" +
      "⚡ /rayos — activar/desactivar alertas de tormenta seca\n" +
      "🚒 /soybombero — ¿sos bombero? activá el modo cuartel\n" +
      "ℹ️ /about — sobre el proyecto\n" +
      "❓ /help — esta lista de comandos\n" +
      "❌ /cancelar — eliminar tu suscripción" +
      FOOTER,
    {
      reply_markup: {
        keyboard: [[{ text: "📍 Compartir ubicacion", request_location: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
}

async function handleAbout(chatId: number) {
  await sendMessage(chatId, ABOUT_TEXT);
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, HELP_TEXT);
}

async function handleRayosToggle(chatId: number) {
  const db = getSupabase();
  const { data: sub } = await db
    .from("subscribers")
    .select("lightning_enabled")
    .eq("chat_id", chatId)
    .limit(1)
    .single();

  if (!sub) {
    await sendMessage(
      chatId,
      "⚡ Primero suscribite con /ciudad o compartiendo tu ubicación." +
        FOOTER
    );
    return;
  }

  // M8 — read-modify-write toggle. There's a tiny race if the user taps /rayos
  // and the preferences button near-simultaneously (two serverless invocations
  // reading the same value). Low impact for a self-toggle; a fully atomic
  // version needs a DB RPC (`SET lightning_enabled = NOT COALESCE(...)`) — see
  // scripts/sql/whi-audit-2026-06-30-optional.sql.
  const next = sub.lightning_enabled === false; // toggle
  await db
    .from("subscribers")
    .update({ lightning_enabled: next })
    .eq("chat_id", chatId);

  await sendMessage(
    chatId,
    next
      ? "⚡ Alertas de tormenta seca <b>activadas</b>.\n\nVas a recibir un aviso cuando se detecte tormenta eléctrica con condiciones secas en tu zona." +
          FOOTER
      : "⚡ Alertas de tormenta seca <b>desactivadas</b>.\n\nSeguís recibiendo alertas de focos de calor. Usa /rayos otra vez para reactivar." +
          FOOTER
  );
}

// Builds the preferences menu (body + keyboard) for an existing subscriber, or
// null if the chat has no subscriber yet. Shared by the command and the callback
// so the menu can be rendered (sendMessage) or updated in place (editMessageText).
async function preferencesView(
  chatId: number
): Promise<{ body: string; keyboard: ReturnType<typeof buildPreferencesKeyboard> } | null> {
  const db = getSupabase();
  const { data: sub } = await db
    .from("subscribers")
    .select("lat, lng, lightning_enabled, prevention_mode")
    .eq("chat_id", chatId)
    .limit(1)
    .maybeSingle();
  if (!sub) return null;

  const { data: zoneData } = await db
    .from("danger_zones")
    .select("id,name,bbox")
    .in("province", PREVENTION_PROVINCE_IDS);
  const covered = findDangerZone(sub.lat, sub.lng, (zoneData ?? []) as never) !== null;

  const keyboard = buildPreferencesKeyboard({
    lightning: sub.lightning_enabled !== false,
    prevention: (sub.prevention_mode ?? "off") as "off" | "alerts" | "daily",
    covered,
  });

  const body =
    "⚙️ <b>Tus avisos</b>\n\n" +
    "🔥 Focos cercanos — <b>siempre activos</b> (es el corazón del servicio)\n" +
    (covered ? "🌲 Elegí si querés avisos de prevención de incendio." : "");

  return { body, keyboard };
}

// Loads the sub, derives coverage, and shows the unified preferences menu.
async function handlePreferencesCommand(chatId: number) {
  const view = await preferencesView(chatId);
  if (!view) {
    await sendMessage(chatId, "⚙️ Primero suscribite con /ciudad o compartiendo tu ubicación." + FOOTER);
    return;
  }
  await sendMessage(chatId, view.body, { reply_markup: view.keyboard });
}

// Applies a preferences button press and re-renders the menu. Todo el cuerpo va
// envuelto en try/catch: este handler corre FUERA del try general del POST, y el
// webhook NUNCA debe tirar 500 (Telegram reintentaría el update). Mismo patrón
// defensivo que handleVote — best-effort answerCallbackQuery en el catch.
async function handlePreferencesCallback(cb: {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}) {
  try {
    const action = parsePreferencesCallback(cb.data);
    if (!action) {
      await answerCallbackQuery(cb.id);
      return;
    }
    const chatId = cb.from.id;
    const db = getSupabase();

    if (action.kind === "lightning") {
      const { data: sub } = await db.from("subscribers").select("lightning_enabled").eq("chat_id", chatId).limit(1).maybeSingle();
      const next = sub?.lightning_enabled === false;
      await db.from("subscribers").update({ lightning_enabled: next }).eq("chat_id", chatId);
      await answerCallbackQuery(cb.id, next ? "Rayos activados" : "Rayos desactivados");
    } else {
      await db.from("subscribers").update({ prevention_mode: action.mode }).eq("chat_id", chatId);
      // starting fresh: drop any stale episode so a new crossing re-alerts cleanly
      await db.from("prevention_alerted").delete().eq("chat_id", chatId);
      const label = action.mode === "daily" ? "Resumen diario" : action.mode === "alerts" ? "Solo si hay peligro" : "Prevención desactivada";
      await answerCallbackQuery(cb.id, label);
    }

    // re-render the menu IN PLACE: edit the existing message instead of stacking
    // a fresh one on every tap. Falls back silently if there's no message ref.
    const view = await preferencesView(chatId);
    if (view && cb.message) {
      await editMessageText(cb.message.chat.id, cb.message.message_id, view.body, {
        reply_markup: view.keyboard,
      });
    }
  } catch (e) {
    log.error({
      event: "bot.preferences_callback_failed",
      err: e instanceof Error ? e.message : String(e),
    });
    try {
      await answerCallbackQuery(cb.id);
    } catch {
      // best-effort
    }
  }
}

async function handleLocation(chatId: number, lat: number, lng: number) {
  // Reverse geocode to get city name
  const geo = await geocodeCity(`${lat},${lng}`);
  const cityName = geo?.name || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  const province = geo?.admin1 || "";

  await upsertSubscriber(chatId, lat, lng, cityName);

  const label = escapeHtml(province ? `${cityName}, ${province}` : cityName);
  // WHI-585 — set clear expectations on when/why alerts arrive
  await sendMessage(
    chatId,
    `✅ <b>Listo, vecino de ${label}</b>\n\n` +
      "Te aviso cuando se detecte fuego dentro de 100 km de tu ubicación.\n\n" +
      "<b>Qué esperar:</b>\n" +
      "• Si el viento empuja humo hacia vos → alerta inmediata 🚨\n" +
      "• Si hay tormenta seca cerca → aviso preventivo ⚡\n" +
      "• Si no pasa nada → silencio. Sin spam.\n\n" +
      "En temporada baja (otoño/invierno) puede no haber avisos por semanas. " +
      "En temporada alta (oct-mar) puede haber varios por día.\n\n" +
      "📊 Probá /estado para ver focos activos cerca tuyo ahora." +
      FOOTER
  );

  // Offer prevention only if the new location falls in a covered zone.
  const db = getSupabase();
  const { data: zoneData } = await db
    .from("danger_zones")
    .select("id,name,bbox")
    .in("province", PREVENTION_PROVINCE_IDS);
  const zone = findDangerZone(lat, lng, (zoneData ?? []) as never);
  if (zone) {
    await sendMessage(
      chatId,
      `🌲 Tu zona (${escapeHtml(zone.name)}) tiene pronóstico de peligro de incendio. ¿Querés que te avise?`,
      {
        reply_markup: buildPreferencesKeyboard({
          lightning: true,
          prevention: "off",
          covered: true,
        }),
      }
    );
  }
}

async function handleCiudad(chatId: number, query: string) {
  if (!query) {
    await sendMessage(chatId, "Escribí el nombre de tu ciudad.\nEj: /ciudad Bariloche");
    return;
  }

  const geo = await geocodeCity(query);
  if (!geo) {
    await sendMessage(
      chatId,
      `No encontré "${escapeHtml(query)}" en Argentina.\nIntentá con otro nombre o compartí tu ubicación GPS.`
    );
    return;
  }

  await upsertSubscriber(chatId, geo.lat, geo.lng, geo.name);

  const label = escapeHtml(geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name);
  // WHI-585 — set clear expectations on when/why alerts arrive
  await sendMessage(
    chatId,
    `✅ <b>Listo, vecino de ${label}</b>\n\n` +
      "Te aviso cuando se detecte fuego dentro de 100 km de tu ubicación.\n\n" +
      "<b>Qué esperar:</b>\n" +
      "• Si el viento empuja humo hacia vos → alerta inmediata 🚨\n" +
      "• Si hay tormenta seca cerca → aviso preventivo ⚡\n" +
      "• Si no pasa nada → silencio. Sin spam.\n\n" +
      "En temporada baja (otoño/invierno) puede no haber avisos por semanas. " +
      "En temporada alta (oct-mar) puede haber varios por día.\n\n" +
      "📊 Probá /estado para ver focos activos cerca tuyo ahora." +
      FOOTER
  );
}

async function handleEstado(chatId: number) {
  const db = getSupabase();
  const { data: sub } = await db
    .from("subscribers")
    .select("lat, lng, city_name")
    .eq("chat_id", chatId)
    .limit(1)
    .single();

  if (!sub) {
    await sendMessage(
      chatId,
      "🔥 <b>Clara — AlertaForestal</b>\n\nNo tenes suscripcion activa.\nUsa /ciudad o comparti tu ubicacion para suscribirte." +
        FOOTER
    );
    return;
  }

  const fires = await fetchFires();
  const nearby = fires
    .map((f) => ({
      ...f,
      distKm: haversineKm(sub.lat, sub.lng, f.latitude, f.longitude),
    }))
    .filter((f) => f.distKm <= 100)
    .sort((a, b) => a.distKm - b.distKm);

  if (nearby.length === 0) {
    // WHI-585 — show last verification + cadence so user knows the system is alive
    const lastCheck = await fetchLastFiresCheck();
    const lastCheckLine = lastCheck
      ? `🕐 Última verificación: hace ${lastCheck} min`
      : "🕐 Verificando actividad...";
    await sendMessage(
      chatId,
      `🔥 <b>Clara — Estado</b>\n\n` +
        `📍 <b>${escapeHtml(sub.city_name)}</b>\n\n` +
        "✅ No hay focos de calor en un radio de 100 km.\n\n" +
        `${lastCheckLine}\n` +
        "🛰️ GOES-19 escanea cada 10 min · NASA FIRMS cada 15 min\n\n" +
        "<i>Si llega a haber un foco, te aviso al toque.</i>" +
        FOOTER +
        "\n<i>Datos: NASA FIRMS VIIRS · NOAA GOES-19 · Open-Meteo</i>"
    );
    return;
  }

  // Build fire data for AI interpretation
  const fireData = nearby.slice(0, 5).map((f) => ({
    distKm: Math.round(f.distKm),
    frp: f.frp,
    confidence: f.confidence,
    lat: f.latitude,
    lng: f.longitude,
  }));

  const interpretation = await interpretFires(sub.city_name, fireData, nearby.length);

  let msg = `🔥 <b>Clara — Estado</b>\n\n`;
  msg += `📍 <b>${escapeHtml(sub.city_name)}</b> — ${nearby.length} foco(s) en 100 km\n\n`;

  if (interpretation) {
    msg += `<i>${escapeHtml(interpretation)}</i>\n\n`;
  }

  // Add Google Maps links for top 3
  for (const f of nearby.slice(0, 3)) {
    const bars = frpBars(f.frp);
    const gMapsUrl = `https://www.google.com/maps?q=${f.latitude},${f.longitude}&z=12`;
    msg += `${bars} <b>${f.frp} MW</b> a ${Math.round(f.distKm)} km — <a href="${gMapsUrl}">ver</a>\n`;
  }
  if (nearby.length > 3) {
    msg += `... y ${nearby.length - 3} mas\n`;
  }

  msg += FOOTER;
  msg += "\n<i>Datos: NASA FIRMS VIIRS · Open-Meteo</i>";
  await sendMessage(chatId, msg);
}

function frpBars(frp: number): string {
  const level = frp < 1 ? 1 : frp < 5 ? 2 : frp < 20 ? 3 : frp < 50 ? 4 : 5;
  return "🟧".repeat(level) + "⬛".repeat(5 - level);
}

async function interpretFires(
  cityName: string,
  fires: { distKm: number; frp: number; confidence: string }[],
  totalCount: number
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Fallback without AI
    const nearest = fires[0];
    const maxFrp = Math.max(...fires.map((f) => f.frp));
    return maxFrp > 20
      ? `Atencion: hay focos de alta potencia (${maxFrp} MW) cerca de tu zona.`
      : `Se detectaron ${totalCount} focos, el mas cercano a ${nearest.distKm} km.`;
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Sos Clara, el bot de AlertaForestal.org. Interpretá los datos de focos de calor para un ciudadano argentino. Sé breve (2-3 lineas max), clara, y usá un tono informativo pero no alarmista. Mencioná si parece quema agricola, flaring industrial o incendio real segun la potencia (FRP). No uses markdown ni emojis. IMPORTANTE — cuando te refieras a vos misma: usá siempre 'Clara' o 'AlertaForestal'. PROHIBIDO usar pronombres ('ella', 'el') o sinonimos ('el sistema', 'la plataforma', 'el servicio', 'la herramienta', 'el bot', 'la app'). Si la frase queda repetitiva, reescribila con sujeto elidido (ej: 'Detecta...' en vez de 'Ella detecta...').",
          },
          {
            role: "user",
            content: `Ciudad: ${cityName}. Focos cercanos (${totalCount} total): ${JSON.stringify(fires)}. Interpretá brevemente la situacion para el usuario.`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    console.error("Groq error:", e);
    const nearest = fires[0];
    return `Se detectaron ${totalCount} focos, el mas cercano a ${nearest.distKm} km.`;
  }
}

async function handleCancelar(chatId: number) {
  const db = getSupabase();
  await db.from("subscribers").delete().eq("chat_id", chatId);
  await sendMessage(
    chatId,
    "🔥 <b>Clara — Suscripcion cancelada</b>\n\n" +
      "Tu suscripcion fue eliminada. Ya no recibiras alertas.\n\n" +
      "Para volver a suscribirte, envia tu ubicacion o usa /ciudad." +
      FOOTER
  );
}

// P1-1 — salir del rol fireman sin perder la suscripción (vuelve a civilian,
// conserva lat/lng/city_name). Antes la única salida era /cancelar, que borraba
// todo. Un bombero que rota de cuartel no debería seguir recibiendo alertas
// operativas ni perder su suscripción de vecino.
async function handleDejarCuartel(chatId: number) {
  const db = getSupabase();
  const { data: sub } = await db
    .from("subscribers")
    .select("role")
    .eq("chat_id", chatId)
    .maybeSingle();

  if (!sub || sub.role !== "fireman") {
    await sendMessage(
      chatId,
      "ℹ️ No estás registrado como bombero. Si querés cancelar tu suscripción, usá <code>/cancelar</code>." +
        FOOTER
    );
    return;
  }

  await db
    .from("subscribers")
    .update({ role: "civilian", cuartel_name: null })
    .eq("chat_id", chatId);

  await sendMessage(
    chatId,
    "✅ <b>Listo</b>. Volviste a alertas de vecino — seguís suscripto en tu zona y no perdés tu ubicación. " +
      "Ya no vas a recibir los mensajes operativos de cuartel." +
      FOOTER
  );
}

// WHI-585 — relative minutes since the last fires_cache write (FIRMS sync).
// Used in /estado to confirm system liveness when there are no fires.
async function fetchLastFiresCheck(): Promise<number | null> {
  try {
    const { data } = await getSupabase()
      .from("fires_cache")
      .select("fetched_at")
      .eq("id", 1)
      .single();
    if (!data?.fetched_at) return null;
    return Math.max(0, Math.round((Date.now() - Date.parse(data.fetched_at)) / 60000));
  } catch {
    return null;
  }
}

// P1-4 — origen del alta (attribution). El deep link `/start <payload>` se guarda
// en bot_commands_log; acá lo resolvemos a `source` la primera vez que el usuario
// se suscribe. Convención del payload: `cuartel-<slug>` (ej. cuartel-bomberos-ushuaia)
// o `src-<slug>` (campañas: QR, radio, etc.). Cualquier otra cosa → organic (null).
function parseStartSource(payload: string): string | null {
  const p = payload.trim().toLowerCase().slice(0, 64);
  const m = /^(cuartel|src)-([a-z0-9-]{1,48})$/.exec(p);
  if (!m) return null;
  return (m[1] === "cuartel" ? "cuartel:" : "campaign:") + m[2];
}

async function resolveSource(chatId: number): Promise<string | null> {
  try {
    const { data } = await getSupabase()
      .from("bot_commands_log")
      .select("args")
      .eq("chat_id", chatId)
      .eq("command", "/start")
      .not("args", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.args ? parseStartSource(data.args) : null;
  } catch {
    return null;
  }
}

async function upsertSubscriber(
  chatId: number,
  lat: number,
  lng: number,
  cityName: string
) {
  const db = getSupabase();
  // First-write-wins: solo seteamos source si el sub es nuevo o no tenía origen,
  // para no pisar la atribución original en re-suscripciones.
  const { data: existing } = await db
    .from("subscribers")
    .select("source")
    .eq("chat_id", chatId)
    .maybeSingle();

  // Reset prevention opt-in when the covered zone changes (or coverage is lost):
  // the user opted into a *specific* zone's forecast, so a relocation should not
  // silently keep alerting on the old zone. Only relevant if prevention is on.
  const { data: prev } = await db
    .from("subscribers")
    .select("lat, lng, prevention_mode")
    .eq("chat_id", chatId)
    .limit(1)
    .maybeSingle();

  let resetPrevention = false;
  if (prev && prev.prevention_mode && prev.prevention_mode !== "off") {
    const { data: zoneData } = await db
      .from("danger_zones")
      .select("id,name,bbox")
      .in("province", PREVENTION_PROVINCE_IDS);
    const zones = (zoneData ?? []) as never;
    const oldZone = findDangerZone(prev.lat, prev.lng, zones);
    const newZone = findDangerZone(lat, lng, zones);
    if (oldZone?.id !== newZone?.id) resetPrevention = true;
  }

  const row: Record<string, unknown> = {
    chat_id: chatId,
    lat,
    lng,
    city_name: cityName,
  };
  if (!existing || existing.source == null) {
    const src = await resolveSource(chatId);
    if (src) row.source = src;
  }
  if (resetPrevention) row.prevention_mode = "off";
  await db.from("subscribers").upsert(row, { onConflict: "chat_id" });
  if (resetPrevention) {
    await db.from("prevention_alerted").delete().eq("chat_id", chatId);
  }
}

// WHI-587 — append-only command log for dashboard engagement chart.
// Best-effort: failure to log never breaks the bot.
async function logBotCommand(chatId: number, command: string, args?: string) {
  try {
    await getSupabase()
      .from("bot_commands_log")
      .insert({ chat_id: chatId, command, args: args ?? null });
  } catch (e) {
    console.error("logBotCommand failed:", e);
  }
}

// WHI-588 Sprint 1 — /soybombero <code> elevates a subscriber to role 'fireman'.
// El consumo del código va por la RPC `consume_fireman_code` (ver migration
// scripts/sql/whi-fireman-codes-hardening.sql) que encapsula atómicamente:
// validación, registro en fireman_code_usage, incremento de used_count y
// promoción del subscriber. Sin esto había TOCTTOU + reuse por mismo chat_id.
async function handleSoyBombero(chatId: number, code: string) {
  if (!code) {
    await sendMessage(
      chatId,
      "🚒 <b>Bomberos voluntarios</b>\n\n" +
        "Si tu cuartel ya está en AlertaForestal, pedíle el código de invitación al jefe de cuartel y usalo así:\n" +
        "<code>/soybombero TU-CODIGO</code>\n\n" +
        "¿Tu cuartel todavía no se sumó? Mirá <b>alertaforestal.org/cuarteles</b>." +
        FOOTER
    );
    return;
  }

  const db = getSupabase();

  // Subscriber tiene que existir antes — la RPC promueve un row existente
  // (no lo crea desde cero, así no perdemos lat/lng/city_name).
  const { data: sub } = await db
    .from("subscribers")
    .select("chat_id, role")
    .eq("chat_id", chatId)
    .limit(1)
    .maybeSingle();

  if (!sub) {
    await sendMessage(
      chatId,
      "🚒 Primero suscribite normalmente con /ciudad o compartiendo tu ubicación. " +
        "Después validás tu rol de bombero con /soybombero." +
        FOOTER
    );
    return;
  }

  type ConsumeResult = { status: string; cuartel_name: string | null };
  const { data: rpcRows, error: rpcErr } = await db.rpc("consume_fireman_code", {
    p_chat_id: chatId,
    p_code: code,
  });

  if (rpcErr) {
    log.error({
      event: "bot.consume_fireman_code_rpc_failed",
      chatId,
      code: rpcErr.code,
      err: rpcErr.message,
    });
    await sendMessage(
      chatId,
      "❌ Error interno al validar el código. Probá de nuevo en unos minutos." +
        FOOTER
    );
    return;
  }

  // La RPC devuelve un SETOF (una row). Manejamos los 4 outcomes posibles.
  const result = Array.isArray(rpcRows) ? (rpcRows[0] as ConsumeResult) : (rpcRows as ConsumeResult | null);
  const status = result?.status ?? "unknown";
  const cuartel = result?.cuartel_name;

  if (status === "not_found") {
    await sendMessage(
      chatId,
      "❌ Código inválido. Pedile a tu cuartel el código correcto." + FOOTER
    );
    return;
  }
  if (status === "exhausted") {
    await sendMessage(
      chatId,
      "❌ Este código ya alcanzó su límite de usos. Pedile uno nuevo a tu cuartel." +
        FOOTER
    );
    return;
  }
  if (status === "already_used") {
    await sendMessage(
      chatId,
      `ℹ️ Ya estás registrado como bombero${cuartel ? ` de ${escapeHtml(cuartel)}` : ""}. ` +
        "Si querés volver a alertas de vecino, usá <code>/dejarcuartel</code> (seguís suscripto). " +
        "Para borrar todo, <code>/cancelar</code>." +
        FOOTER
    );
    return;
  }
  if (status !== "ok" || !cuartel) {
    log.error({
      event: "bot.consume_fireman_code_unexpected",
      chatId,
      status,
    });
    await sendMessage(
      chatId,
      "❌ Error interno al validar el código. Probá de nuevo en unos minutos." +
        FOOTER
    );
    return;
  }

  log.info({
    event: "bot.fireman_promoted",
    chatId,
    cuartel,
  });

  await sendMessage(
    chatId,
    `✅ <b>Listo, bombero de ${escapeHtml(cuartel)}</b>\n\n` +
      "Desde ahora vas a recibir <b>mensajes operativos</b> cuando se detecte un " +
      "foco confirmado en tu zona. Más conciso, con info para coordinar respuesta.\n\n" +
      "Si querés volver a alertas de vecino, usá <code>/dejarcuartel</code> " +
      "(seguís suscripto, sin perder tu ubicación)." +
      FOOTER
  );
}
