import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { geocodeCity } from "@/lib/geocode";
import { fetchFires } from "@/lib/firms";
import { haversineKm } from "@/lib/geo";

/**
 * POST /api/bot/telegram
 *
 * Telegram webhook for @AlertasClaraBot.
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
}

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Bot not configured" });
  }

  const update: TelegramUpdate = await request.json();
  const chatId = update.message?.chat.id;
  if (!chatId) return NextResponse.json({ ok: true });

  const text = update.message?.text?.trim() || "";
  const location = update.message?.location;

  try {
    if (text === "/start") {
      await logBotCommand(chatId, "/start");
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
    } else if (location) {
      await logBotCommand(chatId, "<location>");
      await handleLocation(chatId, location.latitude, location.longitude);
    } else if (text.startsWith("/ciudad ")) {
      const arg = text.replace("/ciudad ", "").trim();
      await logBotCommand(chatId, "/ciudad", arg);
      await handleCiudad(chatId, arg);
    } else if (text === "/estado") {
      await logBotCommand(chatId, "/estado");
      await handleEstado(chatId);
    } else if (text === "/cancelar") {
      await logBotCommand(chatId, "/cancelar");
      await handleCancelar(chatId);
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
    console.error("Bot error:", err);
    await sendMessage(chatId, "Error interno. Intenta de nuevo en unos minutos.");
  }

  return NextResponse.json({ ok: true });
}

const CLARA_FOOTER = "\n—\nCentral de Localizacion y Alerta de Riesgo Ambiental (CLARA)";

const ABOUT_TEXT =
  "🔥 <b>CLARA — Alertas de incendios forestales gratis</b>\n\n" +
  "CLARA es un proyecto independiente, gratuito, hecho en Argentina para que " +
  "los vecinos de zonas afectadas se enteren antes de los incendios y puedan " +
  "prevenirse.\n\n" +
  "Usa datos de NASA (FIRMS), NOAA y otros servicios públicos para detectar " +
  "focos de calor cerca tuyo y avisarte cuando el viento puede traer humo o " +
  "fuego a tu zona. También alerta por tormentas eléctricas secas — la causa " +
  "#1 natural de incendios forestales.\n\n" +
  "Este proyecto existe gracias al trabajo pionero de Satellites On Fire " +
  "(@satellitesonfire), que demostró que se podía detectar incendios mejor " +
  "que la NASA desde Argentina. Si sos una empresa, gobierno, forestal o " +
  "aseguradora, te recomendamos satellitesonfire.com.\n\n" +
  "CLARA es para vos, vecino de zona de riesgo. Gratis, siempre.\n\n" +
  "Hecho con cariño en Bahía Blanca por Whitebay." +
  CLARA_FOOTER;

const HELP_TEXT =
  "🔥 <b>CLARA — Comandos</b>\n\n" +
  "📍 Compartí tu ubicación (clip 📎 → Ubicación)\n" +
  "🏙 /ciudad &lt;nombre&gt; — suscribirte por ciudad\n" +
  "📊 /estado — focos activos cerca tuyo\n" +
  "⚡ /rayos — activar/desactivar alerta de tormentas secas\n" +
  "ℹ️ /about — sobre el proyecto\n" +
  "❌ /cancelar — eliminar suscripción" +
  CLARA_FOOTER;

async function handleStart(chatId: number) {
  await sendMessage(
    chatId,
    "🔥 <b>CLARA — Alerta de Incendios</b>\n\n" +
      "Detectamos focos de calor en toda Argentina con satélites de NASA " +
      "(FIRMS) y NOAA (GOES-19) y te alertamos por Telegram. También avisamos " +
      "cuando hay tormenta eléctrica seca cerca tuyo.\n\n" +
      "<b>Para empezar:</b>\n" +
      "📍 Enviá tu ubicación (clip 📎 → Ubicación)\n" +
      "🏙 O escribí /ciudad Bariloche\n\n" +
      "<b>Comandos disponibles:</b>\n" +
      "📊 /estado — focos activos en 100 km a tu alrededor\n" +
      "⚡ /rayos — activar/desactivar alertas de tormenta seca\n" +
      "ℹ️ /about — sobre el proyecto\n" +
      "❓ /help — esta lista de comandos\n" +
      "❌ /cancelar — eliminar tu suscripción" +
      CLARA_FOOTER,
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
        CLARA_FOOTER
    );
    return;
  }

  const next = sub.lightning_enabled === false; // toggle
  await db
    .from("subscribers")
    .update({ lightning_enabled: next })
    .eq("chat_id", chatId);

  await sendMessage(
    chatId,
    next
      ? "⚡ Alertas de tormenta seca <b>activadas</b>.\n\nVas a recibir un aviso cuando se detecte tormenta eléctrica con condiciones secas en tu zona." +
          CLARA_FOOTER
      : "⚡ Alertas de tormenta seca <b>desactivadas</b>.\n\nSeguís recibiendo alertas de focos de calor. Usa /rayos otra vez para reactivar." +
          CLARA_FOOTER
  );
}

async function handleLocation(chatId: number, lat: number, lng: number) {
  // Reverse geocode to get city name
  const geo = await geocodeCity(`${lat},${lng}`);
  const cityName = geo?.name || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  const province = geo?.admin1 || "";

  await upsertSubscriber(chatId, lat, lng, cityName);

  const label = province ? `${cityName}, ${province}` : cityName;
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
      CLARA_FOOTER
  );
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
      `No encontré "${query}" en Argentina.\nIntentá con otro nombre o compartí tu ubicación GPS.`
    );
    return;
  }

  await upsertSubscriber(chatId, geo.lat, geo.lng, geo.name);

  const label = geo.admin1 ? `${geo.name}, ${geo.admin1}` : geo.name;
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
      CLARA_FOOTER
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
      "🔥 <b>CLARA</b>\n\nNo tenes suscripcion activa.\nUsa /ciudad o comparti tu ubicacion para suscribirte." +
        CLARA_FOOTER
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
      `🔥 <b>CLARA — Estado</b>\n\n` +
        `📍 <b>${sub.city_name}</b>\n\n` +
        "✅ No hay focos de calor en un radio de 100 km.\n\n" +
        `${lastCheckLine}\n` +
        "🛰️ GOES-19 escanea cada 10 min · NASA FIRMS cada 15 min\n\n" +
        "<i>Si llega a haber un foco, te aviso al toque.</i>" +
        CLARA_FOOTER +
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

  let msg = `🔥 <b>CLARA — Estado</b>\n\n`;
  msg += `📍 <b>${sub.city_name}</b> — ${nearby.length} foco(s) en 100 km\n\n`;

  if (interpretation) {
    msg += `<i>${interpretation}</i>\n\n`;
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

  msg += CLARA_FOOTER;
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
              "Sos CLARA, un sistema de alerta de incendios forestales. Interpreta los datos de focos de calor para un ciudadano argentino. Se breve (2-3 lineas max), claro, y usa un tono informativo pero no alarmista. Menciona si parece quema agricola, flaring industrial o incendio real segun la potencia (FRP). No uses markdown ni emojis. IMPORTANTE — cuando te refieras a vos misma: usa siempre 'CLARA' (o 'Central de Localizacion y Alerta de Riesgo Ambiental'). PROHIBIDO usar pronombres ('ella', 'el') o sinonimos ('el sistema', 'la plataforma', 'el servicio', 'la herramienta', 'el bot', 'la app'). Si la frase queda repetitiva, reescribila con sujeto elidido (ej: 'Detecta...' en vez de 'Ella detecta...').",
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
    "🔥 <b>CLARA — Suscripcion cancelada</b>\n\n" +
      "Tu suscripcion fue eliminada. Ya no recibiras alertas.\n\n" +
      "Para volver a suscribirte, envia tu ubicacion o usa /ciudad." +
      CLARA_FOOTER
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

async function upsertSubscriber(
  chatId: number,
  lat: number,
  lng: number,
  cityName: string
) {
  await getSupabase()
    .from("subscribers")
    .upsert(
      { chat_id: chatId, lat, lng, city_name: cityName },
      { onConflict: "chat_id" }
    );
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
// The code is validated against the fireman_codes table (codes distributed by
// the project owner to fire brigades, one or many per cuartel).
async function handleSoyBombero(chatId: number, code: string) {
  if (!code) {
    await sendMessage(
      chatId,
      "🚒 <b>Bomberos voluntarios</b>\n\n" +
        "Si tu cuartel tiene un código de invitación, usalo así:\n" +
        "<code>/soybombero TU-CODIGO</code>\n\n" +
        "Si todavía no tenés código y querés sumar a tu cuartel a CLARA, escribinos." +
        CLARA_FOOTER
    );
    return;
  }

  const db = getSupabase();

  // Verify subscriber exists
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
        CLARA_FOOTER
    );
    return;
  }

  // Lookup the code
  const { data: codeRow } = await db
    .from("fireman_codes")
    .select("code, cuartel_name, used_count, max_uses")
    .eq("code", code)
    .maybeSingle();

  if (!codeRow) {
    await sendMessage(
      chatId,
      "❌ Código inválido. Pedile a tu cuartel el código correcto." +
        CLARA_FOOTER
    );
    return;
  }

  if (codeRow.max_uses != null && codeRow.used_count >= codeRow.max_uses) {
    await sendMessage(
      chatId,
      "❌ Este código ya alcanzó su límite de usos. Pedile uno nuevo a tu cuartel." +
        CLARA_FOOTER
    );
    return;
  }

  // Elevate
  await db
    .from("subscribers")
    .update({ role: "fireman", cuartel_name: codeRow.cuartel_name })
    .eq("chat_id", chatId);

  await db
    .from("fireman_codes")
    .update({ used_count: (codeRow.used_count ?? 0) + 1 })
    .eq("code", codeRow.code);

  await sendMessage(
    chatId,
    `✅ <b>Listo, bombero de ${codeRow.cuartel_name}</b>\n\n` +
      "Desde ahora vas a recibir <b>mensajes operativos</b> cuando se detecte un " +
      "foco confirmado en tu zona. Más conciso, con info para coordinar respuesta.\n\n" +
      "Si querés volver a alertas civiles, escribí <code>/cancelar</code> y " +
      "suscribite de nuevo." +
      CLARA_FOOTER
  );
}
