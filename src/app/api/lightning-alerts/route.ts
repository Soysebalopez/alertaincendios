import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchDryConditions, fetchLightningRisk, type LightningRisk } from "@/lib/lightning";
import {
  GLM_NEAR_RADIUS_KM,
  flashesNear,
  glmDataIsFresh,
  isDryLightningRisk,
  type Flash,
} from "@/lib/lightning-near";
import { sendMessage, escapeHtml } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { fetchAllRows } from "@/lib/paginate";
import { log } from "@/lib/logger";

/**
 * GET /api/lightning-alerts
 *
 * WHI-543 — Cron de alertas preventivas por tormenta eléctrica seca.
 * WHI-907 parte 2 — usa rayos REALES del GLM (GOES-19) mientras la
 * sincronización está viva (`_clara_config.glm_last_sync_at` reciente y la
 * tabla `lightning_flashes` existe). Si no, vuelve al método anterior:
 * pronóstico de tormenta de OpenWeather / Open-Meteo.
 *
 * Rate limit: 30 min por suscriptor (vía lightning_alerted.alerted_at).
 * Solo alerta con rayo/tormenta + condiciones secas (humedad < 60%, lluvia < 0.5 mm).
 */
const RECENT_FLASH_MINUTES = 30;
const GLM_HEARTBEAT_KEY = "glm_last_sync_at";

type Db = ReturnType<typeof getSupabase>;
type Subscriber = {
  chat_id: number;
  lat: number;
  lng: number;
  city_name: string;
  lightning_enabled?: boolean;
};
type FlashRow = { flash_at: string; lat: number; lng: number };
type DryConditions = { humidity: number | null; recentRainMm: number | null };

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  // Paginated — a plain select caps silently at 1000 rows (PostgREST).
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

  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const flashesSince = new Date(now.getTime() - RECENT_FLASH_MINUTES * 60 * 1000).toISOString();

  const glm = await glmAvailability(db, now, flashesSince);
  if (!glm.ok) {
    // Expected until the GLM migration and cron are live (WHI-907 C2/C5).
    log.info({ event: "lightning_alerts.glm_unavailable", reason: glm.reason });
  }

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
    let msg: string;
    if (glm.ok) {
      const near = await nearbyFlashes(db, sub, flashesSince);
      if (near.length === 0) continue;
      const dry = await fetchDryConditions(sub.lat, sub.lng);
      if (!isDryLightningRisk({ flashesNearby: near.length, ...dry })) continue;
      msg = glmMessage(sub.city_name, near, dry, now);
    } else {
      const risk = await fetchLightningRisk(sub.lat, sub.lng);
      if (!risk.hasFireRisk) continue;
      msg = forecastMessage(sub.city_name, risk);
    }

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
    source: glm.ok ? "glm" : "weather-code",
  });
}

/**
 * Real flashes can be trusted only while the GLM sync is alive: a quiet sky and
 * a dead sync both mean "no rows", so the heartbeat — written on every
 * successful run, flashes or not — is what tells them apart.
 */
async function glmAvailability(
  db: Db,
  now: Date,
  since: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data: heartbeat } = await db
    .from("_clara_config")
    .select("value")
    .eq("key", GLM_HEARTBEAT_KEY)
    .maybeSingle();
  const lastSync = (heartbeat as { value?: string } | null)?.value ?? null;
  if (!glmDataIsFresh(lastSync, now)) {
    return { ok: false, reason: lastSync ? "stale_heartbeat" : "no_heartbeat" };
  }

  const { error } = await db
    .from("lightning_flashes")
    .select("flash_at")
    .gte("flash_at", since)
    .limit(1);
  if (error) return { ok: false, reason: `flashes_table_error:${error.code}` };
  return { ok: true };
}

async function nearbyFlashes(
  db: Db,
  sub: Subscriber,
  since: string
): Promise<Array<Flash & { distKm: number }>> {
  // Bounding box first so the query stays small even in a large storm.
  const dLat = GLM_NEAR_RADIUS_KM / 111;
  const dLng = GLM_NEAR_RADIUS_KM / (111 * Math.max(Math.cos((sub.lat * Math.PI) / 180), 0.01));
  const { data, error } = await db
    .from("lightning_flashes")
    .select("flash_at, lat, lng")
    .gte("flash_at", since)
    .gte("lat", sub.lat - dLat)
    .lte("lat", sub.lat + dLat)
    .gte("lng", sub.lng - dLng)
    .lte("lng", sub.lng + dLng)
    .limit(1000);

  if (error || !data) {
    log.error({
      event: "lightning_alerts.flashes_query_failed",
      chatId: sub.chat_id,
      code: error?.code,
      err: error?.message,
    });
    return [];
  }
  const flashes: Flash[] = (data as FlashRow[]).map((row) => ({
    flashAt: row.flash_at,
    lat: row.lat,
    lng: row.lng,
  }));
  return flashesNear(flashes, sub.lat, sub.lng);
}

function glmMessage(
  cityName: string,
  near: Array<Flash & { distKm: number }>,
  dry: DryConditions,
  now: Date
): string {
  const nearest = near[0];
  const minutesAgo = Math.max(0, Math.round((now.getTime() - Date.parse(nearest.flashAt)) / 60000));
  const others = near.length > 1 ? ` · ${near.length} rayos en ${GLM_NEAR_RADIUS_KM} km` : "";
  return (
    `⚡ <b>Clara — Rayo con tormenta seca</b>\n\n` +
    `📍 <b>${escapeHtml(cityName)}</b>\n` +
    `⚡ Rayo detectado a ~${Math.round(nearest.distKm)} km (hace ${minutesAgo} min)${others}\n` +
    `💧 Humedad: ${Math.round(dry.humidity ?? 0)}%\n` +
    `🌧 Lluvia última hora: ${(dry.recentRainMm ?? 0).toFixed(1)} mm\n\n` +
    `Un rayo con aire seco puede iniciar un incendio. Prestá atención a los próximos minutos.\n\n` +
    `Usa /rayos para activar/desactivar este tipo de alerta.\n\n` +
    `—\nClara · AlertaForestal.org\n` +
    `<i>Datos: NOAA GOES-19 (GLM) · Open-Meteo</i>`
  );
}

function forecastMessage(cityName: string, risk: LightningRisk): string {
  return (
    `⚡ <b>Clara — Alerta de tormenta seca</b>\n\n` +
    `📍 <b>${escapeHtml(cityName)}</b>\n` +
    `🌩 Tormenta eléctrica activa\n` +
    `💧 Humedad: ${Math.round(risk.humidity)}%\n` +
    `🌧 Lluvia última hora: ${risk.recentRainMm.toFixed(1)} mm\n\n` +
    `Las tormentas secas son la causa #1 de incendios forestales naturales. ` +
    `Mantenete atento a los próximos minutos.\n\n` +
    `Usa /rayos para activar/desactivar este tipo de alerta.\n\n` +
    `—\nClara · AlertaForestal.org\n` +
    `<i>Datos: ${risk.source === "openweather" ? "OpenWeather" : "Open-Meteo"}</i>`
  );
}
