import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchFires, FirePoint } from "@/lib/firms";
import { fetchWind } from "@/lib/wind";
import { haversineKm, isUpwind, smokeEtaMinutes } from "@/lib/geo";
import { sendMessage } from "@/lib/telegram";

/**
 * GET /api/alerts
 *
 * Cron endpoint — called by Vercel Cron or manually with ?secret=...
 * 1. Reads cached fires from Supabase
 * 2. For each fire, evaluates all subscribers (dispersion model)
 * 3. Sends Telegram alerts to affected subscribers
 * 4. Deduplicates via ai_alerted_fires table
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  const bearerToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const isAuthorized =
    secret === process.env.CRON_SECRET || bearerToken === process.env.CRON_SECRET;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fires = await fetchFires();
    if (fires.length === 0) {
      return NextResponse.json({ processed: 0, alerts: 0 });
    }

    const db = getSupabase();

    // Get all subscribers
    const { data: subscribers } = await db
      .from("subscribers")
      .select("chat_id, lat, lng, city_name");

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ processed: fires.length, alerts: 0, reason: "no subscribers" });
    }

    let alertsSent = 0;

    for (const fire of fires) {
      const fireKey = buildFireKey(fire);

      for (const sub of subscribers) {
        // Check if already alerted
        const { data: existing } = await db
          .from("ai_alerted_fires")
          .select("fire_key")
          .eq("fire_key", fireKey)
          .eq("chat_id", sub.chat_id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const distKm = haversineKm(sub.lat, sub.lng, fire.latitude, fire.longitude);
        if (distKm > 100) continue; // Skip fires > 100km away

        // Get wind at fire location
        const wind = await fetchWind(fire.latitude, fire.longitude);
        const upwind = isUpwind(sub.lat, sub.lng, fire.latitude, fire.longitude, wind.windDirection);
        const eta = smokeEtaMinutes(distKm, wind.windSpeed, upwind.isUpwind);

        const level = classifyAlert(distKm, upwind.isUpwind);
        if (level === "none") continue;

        // Send alert
        const message = await formatAlert(fire, sub, distKm, eta, level);
        await sendMessage(sub.chat_id, message);

        // Record to avoid duplicate alerts
        await db.from("ai_alerted_fires").insert({
          fire_key: fireKey,
          chat_id: sub.chat_id,
          alerted_at: new Date().toISOString(),
        });

        alertsSent++;
      }
    }

    return NextResponse.json({
      processed: fires.length,
      subscribers: subscribers.length,
      alerts: alertsSent,
    });
  } catch (error) {
    console.error("Alerts cron error:", error);
    return NextResponse.json({ error: "Alert processing failed" }, { status: 500 });
  }
}

function buildFireKey(fire: FirePoint): string {
  return `${fire.latitude.toFixed(3)}_${fire.longitude.toFixed(3)}_${fire.acqDate}`;
}

function classifyAlert(
  distKm: number,
  upwind: boolean
): "danger" | "warning" | "info" | "none" {
  if (distKm < 20 && upwind) return "danger";
  if (distKm < 50 && upwind) return "warning";
  if (distKm < 50) return "info";
  return "none";
}

function frpLabel(frp: number): string {
  if (frp < 1) return "Muy baja (posible flaring industrial)";
  if (frp < 5) return "Baja (quema agricola o foco menor)";
  if (frp < 20) return "Moderada (incendio activo)";
  if (frp < 50) return "Alta (incendio forestal significativo)";
  return "Muy alta (incendio de gran magnitud)";
}

function frpBars(frp: number): string {
  const level =
    frp < 1 ? 1 : frp < 5 ? 2 : frp < 20 ? 3 : frp < 50 ? 4 : 5;
  return "🟧".repeat(level) + "⬛".repeat(5 - level);
}

async function formatAlert(
  fire: FirePoint,
  sub: { city_name: string },
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info"
): Promise<string> {
  const dist = Math.round(distKm * 10) / 10;
  const emoji = level === "danger" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
  const gMapsUrl = `https://www.google.com/maps?q=${fire.latitude},${fire.longitude}&z=12`;

  // AI interpretation
  const interpretation = await interpretFire(fire, sub.city_name, dist, etaMinutes, level);

  let msg = `${emoji} <b>CLARA — Alerta de Incendio</b>\n\n`;
  msg += `📍 Foco detectado a <b>${dist} km</b> de ${sub.city_name}\n`;

  if (etaMinutes > 0) {
    msg += `💨 El viento dirige el humo hacia tu zona\n`;
    msg += `⏱ ETA del humo: ~${etaMinutes} minutos\n`;
  }

  msg += `\n${frpBars(fire.frp)} <b>${fire.frp} MW</b> — Potencia ${frpLabel(fire.frp).split(" (")[0]}\n`;

  if (interpretation) {
    msg += `\n<i>${interpretation}</i>\n`;
  }

  msg += `\n📌 <a href="${gMapsUrl}">Ver en Google Maps</a>`;
  msg += `\n\n—\nCentral de Localizacion y Alerta de Riesgo Ambiental (CLARA)`;
  msg += `\n<i>Datos: NASA FIRMS VIIRS · Open-Meteo</i>`;

  return msg;
}

async function interpretFire(
  fire: FirePoint,
  cityName: string,
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info"
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

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
              "Sos CLARA, un sistema de alerta de incendios. Interpreta este foco de calor en 2-3 oraciones breves para un ciudadano argentino. Considera la potencia (FRP), distancia, y si el viento lo afecta. Si el FRP es bajo (<5 MW) en zona petrolera de Neuquen/Mendoza, menciona que puede ser flaring. Si es alto, se directo sobre el riesgo. No uses markdown ni emojis. Habla en tercera persona.",
          },
          {
            role: "user",
            content: `Foco: ${fire.frp} MW, ${distKm} km de ${cityName}, confianza ${fire.confidence}, coordenadas ${fire.latitude},${fire.longitude}. Nivel: ${level}. ${etaMinutes > 0 ? `ETA humo: ${etaMinutes} min.` : "Viento no dirige humo hacia la zona."}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}
