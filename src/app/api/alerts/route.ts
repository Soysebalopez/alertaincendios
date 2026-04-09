import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchFires, FirePoint } from "@/lib/firms";
import { fetchWind } from "@/lib/wind";
import { haversineKm, isUpwind, smokeEtaMinutes } from "@/lib/geo";
import { sendMessage } from "@/lib/telegram";

/**
 * GET /api/alerts?secret=...
 *
 * Cron endpoint — runs every 15 minutes via Netlify scheduled function.
 * 1. Fetches new fires from FIRMS
 * 2. For each fire, evaluates all subscribers (dispersion model)
 * 3. Sends Telegram alerts to affected subscribers
 * 4. Deduplicates via alerted_fires table
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
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
        const message = formatAlert(fire, sub, distKm, eta, level);
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

function formatAlert(
  fire: FirePoint,
  sub: { city_name: string },
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info"
): string {
  const dist = Math.round(distKm * 10) / 10;
  const emoji = level === "danger" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";

  let msg = `${emoji} <b>Foco de calor detectado</b>\n\n`;
  msg += `📍 A ${dist} km de ${sub.city_name}\n`;

  if (etaMinutes > 0) {
    msg += `💨 El viento dirige el humo hacia tu zona\n`;
    msg += `⏱ ETA del humo: ~${etaMinutes} minutos\n`;
  }

  msg += `\n🔗 <a href="https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;l:noaa21-viirs-c2,viirs-i-fires;@${fire.longitude},${fire.latitude},10z">Ver en mapa FIRMS</a>`;
  msg += `\n\n<i>Fuente: NASA FIRMS VIIRS</i>`;

  return msg;
}
