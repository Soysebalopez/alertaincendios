import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchLightningRisk } from "@/lib/lightning";
import { sendMessage, escapeHtml } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { fetchAllRows } from "@/lib/paginate";
import { log } from "@/lib/logger";

/**
 * GET /api/lightning-alerts
 *
 * WHI-543 — Cron de alertas preventivas por tormenta eléctrica seca.
 * Se invoca desde el script local sync-fires.sh con ?secret=...
 *
 * Rate limit: 30 min por suscriptor (vía lightning_alerted.alerted_at).
 * Solo alerta si hay tormenta + condiciones secas (humedad < 60%, lluvia < 0.5 mm).
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  // Paginated — a plain select caps silently at 1000 rows (PostgREST).
  type Subscriber = {
    chat_id: number;
    lat: number;
    lng: number;
    city_name: string;
    lightning_enabled?: boolean;
  };
  const subscribers = await fetchAllRows<Subscriber>(
    db,
    "subscribers",
    "chat_id, lat, lng, city_name, lightning_enabled",
    (q) => q.order("chat_id")
  );

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ checked: 0, alerts: 0 });
  }

  // If column doesn't exist yet (migration pending), fall back to "enabled".
  const enabled = subscribers.filter(
    (s) => s.lightning_enabled !== false
  );

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  let alertsSent = 0;
  let evaluated = 0;

  for (const sub of enabled) {
    // Skip if already alerted in last 30 min
    const { data: recent } = await db
      .from("lightning_alerted")
      .select("alerted_at")
      .eq("chat_id", sub.chat_id)
      .gte("alerted_at", cutoff)
      .limit(1);

    if (recent && recent.length > 0) continue;

    evaluated++;
    const risk = await fetchLightningRisk(sub.lat, sub.lng);
    if (!risk.hasFireRisk) continue;

    const msg =
      `⚡ <b>Clara — Alerta de tormenta seca</b>\n\n` +
      `📍 <b>${escapeHtml(sub.city_name)}</b>\n` +
      `🌩 Tormenta eléctrica activa\n` +
      `💧 Humedad: ${Math.round(risk.humidity)}%\n` +
      `🌧 Lluvia última hora: ${risk.recentRainMm.toFixed(1)} mm\n\n` +
      `Las tormentas secas son la causa #1 de incendios forestales naturales. ` +
      `Mantenete atento a los próximos minutos.\n\n` +
      `Usa /rayos para activar/desactivar este tipo de alerta.\n\n` +
      `—\nClara · AlertaForestal.org\n` +
      `<i>Datos: ${risk.source === "openweather" ? "OpenWeather" : "Open-Meteo"}</i>`;

    // Only record the dedup row if the send actually succeeded — otherwise a
    // failed send would suppress re-alerting for 30 min. (M5: the SELECT-then-
    // INSERT dedup still has a tiny race under overlapping cron runs; fully
    // closing it needs a UNIQUE constraint — see audit doc.)
    const sendResult = await sendMessage(sub.chat_id, msg);
    if (!sendResult.ok) {
      log.error({
        event: "lightning_alerts.send_failed",
        chatId: sub.chat_id,
        status: sendResult.status,
        blocked: sendResult.blocked,
        err: sendResult.description,
      });
      continue;
    }

    await db.from("lightning_alerted").insert({
      chat_id: sub.chat_id,
      alerted_at: new Date().toISOString(),
    });

    alertsSent++;
  }

  return NextResponse.json({
    subscribers: subscribers.length,
    enabled: enabled.length,
    evaluated,
    alerts: alertsSent,
  });
}
