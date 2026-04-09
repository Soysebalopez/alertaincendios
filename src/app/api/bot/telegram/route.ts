import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { geocodeCity } from "@/lib/geocode";
import { fetchFires } from "@/lib/firms";
import { haversineKm } from "@/lib/geo";

/**
 * POST /api/bot/telegram
 *
 * Telegram webhook for @AlertaIncendiosArgBot.
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

async function handleStart(chatId: number) {
  await sendMessage(
    chatId,
    "<b>AlertaIncendios Argentina</b> 🔥\n\n" +
      "Recibí alertas cuando se detecten focos de calor cerca de tu ubicación.\n\n" +
      "<b>¿Cómo suscribirte?</b>\n" +
      "📍 Enviá tu ubicación (clip 📎 → Ubicación)\n" +
      "🏙 O escribí /ciudad Buenos Aires\n\n" +
      "<b>Comandos:</b>\n" +
      "/ciudad &lt;nombre&gt; — Suscribirte por ciudad\n" +
      "/estado — Ver tu suscripción y focos cercanos\n" +
      "/cancelar — Eliminar suscripción\n\n" +
      "<i>Fuente: NASA FIRMS VIIRS (actualización cada 15 min)</i>",
    {
      reply_markup: {
        keyboard: [[{ text: "📍 Compartir ubicación", request_location: true }]],
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
    `✅ Suscripción activada para <b>${label}</b>\n\n` +
      "Vas a recibir alertas cuando se detecten focos de calor cerca de tu ubicación.\n\n" +
      "Usa /estado para ver focos activos cerca tuyo."
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
    `✅ Suscripción activada para <b>${label}</b>\n\n` +
      "Vas a recibir alertas cuando se detecten focos de calor en un radio de 100 km.\n\n" +
      "Usa /estado para ver focos activos cerca tuyo."
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
      "No tenés suscripción activa.\nUsá /ciudad o compartí tu ubicación para suscribirte."
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

  let msg = `📍 Suscripción: <b>${sub.city_name}</b>\n\n`;

  if (nearby.length === 0) {
    msg += "✅ No hay focos de calor en un radio de 100 km.";
  } else {
    msg += `🔥 <b>${nearby.length} foco(s)</b> en un radio de 100 km:\n\n`;
    for (const f of nearby.slice(0, 5)) {
      msg += `  • ${Math.round(f.distKm)} km — confianza: ${f.confidence}\n`;
    }
    if (nearby.length > 5) {
      msg += `  ... y ${nearby.length - 5} más\n`;
    }
  }

  msg += "\n<i>Fuente: NASA FIRMS (últimas 24h)</i>";
  await sendMessage(chatId, msg);
}

async function handleCancelar(chatId: number) {
  const db = getSupabase();
  await db.from("subscribers").delete().eq("chat_id", chatId);
  await sendMessage(chatId, "🗑 Suscripción eliminada. Ya no recibirás alertas.");
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
