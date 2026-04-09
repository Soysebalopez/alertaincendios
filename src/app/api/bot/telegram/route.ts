import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { geocodeCity } from "@/lib/geocode";
import { fetchFires } from "@/lib/firms";
import { haversineKm } from "@/lib/geo";

/**
 * POST /api/bot/telegram
 *
 * Telegram webhook for @AlertaIncendiosBot.
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
    if (text === "/start" || text === "/help") {
      await handleStart(chatId);
    } else if (location) {
      await handleLocation(chatId, location.latitude, location.longitude);
    } else if (text.startsWith("/ciudad ")) {
      await handleCiudad(chatId, text.replace("/ciudad ", "").trim());
    } else if (text === "/estado") {
      await handleEstado(chatId);
    } else if (text === "/cancelar") {
      await handleCancelar(chatId);
    } else {
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

async function handleStart(chatId: number) {
  await sendMessage(
    chatId,
    "🔥 <b>CLARA — Alerta de Incendios</b>\n\n" +
      "Detectamos focos de calor en toda Argentina con satelites de la NASA y te alertamos por Telegram.\n\n" +
      "<b>Suscribite:</b>\n" +
      "📍 Envia tu ubicacion (clip 📎 → Ubicacion)\n" +
      "🏙 O escribi /ciudad Buenos Aires\n\n" +
      "<b>Comandos:</b>\n" +
      "/ciudad &lt;nombre&gt; — Suscribirte por ciudad\n" +
      "/estado — Ver focos cercanos\n" +
      "/cancelar — Eliminar suscripcion\n" +
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

async function handleLocation(chatId: number, lat: number, lng: number) {
  // Reverse geocode to get city name
  const geo = await geocodeCity(`${lat},${lng}`);
  const cityName = geo?.name || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  const province = geo?.admin1 || "";

  await upsertSubscriber(chatId, lat, lng, cityName);

  const label = province ? `${cityName}, ${province}` : cityName;
  await sendMessage(
    chatId,
    `🔥 <b>CLARA — Suscripcion activada</b>\n\n` +
      `📍 Ubicacion: <b>${label}</b>\n\n` +
      "Vas a recibir alertas cuando se detecten focos de calor en un radio de 100 km de tu ubicacion.\n\n" +
      "Usa /estado para ver focos activos cerca tuyo." +
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
  await sendMessage(
    chatId,
    `🔥 <b>CLARA — Suscripcion activada</b>\n\n` +
      `📍 Ubicacion: <b>${label}</b>\n\n` +
      "Vas a recibir alertas cuando se detecten focos de calor en un radio de 100 km de tu ubicacion.\n\n" +
      "Usa /estado para ver focos activos cerca tuyo." +
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
    await sendMessage(
      chatId,
      `🔥 <b>CLARA — Estado</b>\n\n` +
        `📍 <b>${sub.city_name}</b>\n\n` +
        "✅ No hay focos de calor en un radio de 100 km." +
        CLARA_FOOTER +
        "\n<i>Datos: NASA FIRMS VIIRS · Open-Meteo</i>"
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
              "Sos CLARA, un sistema de alerta de incendios forestales. Interpreta los datos de focos de calor para un ciudadano argentino. Se breve (2-3 lineas max), claro, y usa un tono informativo pero no alarmista. Menciona si parece quema agricola, flaring industrial o incendio real segun la potencia (FRP). No uses markdown ni emojis. Habla en tercera persona.",
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
