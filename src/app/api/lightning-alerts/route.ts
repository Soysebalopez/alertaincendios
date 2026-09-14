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
import {
  XWEATHER_ATTRIBUTION,
  closestLightningUrl,
  parseLightningResponse,
  withinMonthlyBudget,
  xweatherConfigured,
} from "@/lib/xweather";
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
 * WHI-907 parte 3 — con credenciales de Xweather, cuando ya sale una alerta por
 * rayos GLM, pregunta si hubo un rayo nube-tierra cerca en los últimos 5 min
 * (10 accesos por consulta, contados por mes en `_clara_config`). Sin
 * credenciales, sin cupo o si falla, la alerta sale igual que antes.
 *
 * Rate limit: 30 min por suscriptor (vía lightning_alerted.alerted_at).
 * Solo alerta con rayo/tormenta + condiciones secas (humedad < 60%, lluvia < 0.5 mm).
 */
const RECENT_FLASH_MINUTES = 30;
const GLM_HEARTBEAT_KEY = "glm_last_sync_at";
const XWEATHER_TIMEOUT_MS = 5000;

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
type XweatherRun = { key: string; used: number; queries: number; confirmed: number; skippedBudget: number };

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
  const xweather = glm.ok ? await xweatherRun(db, now) : null;

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
      const groundStrikeKm = xweather ? await cloudToGroundNear(db, xweather, sub) : null;
      msg = glmMessage(sub.city_name, near, dry, now, groundStrikeKm);
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
    xweather: xweather
      ? { queries: xweather.queries, confirmed: xweather.confirmed, skipped_budget: xweather.skippedBudget }
      : null,
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

/** The month's Xweather query counter, or null when there are no credentials. */
async function xweatherRun(db: Db, now: Date): Promise<XweatherRun | null> {
  if (!xweatherConfigured()) return null;
  const key = `xweather_queries_${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data } = await db.from("_clara_config").select("value").eq("key", key).maybeSingle();
  const used = Number.parseInt((data as { value?: string } | null)?.value ?? "0", 10);
  return { key, used: Number.isFinite(used) ? used : 0, queries: 0, confirmed: 0, skippedBudget: 0 };
}

/**
 * Distance to the nearest cloud-to-ground strike Xweather saw near the
 * subscriber in the last 5 minutes, or null (none, no budget, or a failure).
 */
async function cloudToGroundNear(db: Db, run: XweatherRun, sub: Subscriber): Promise<number | null> {
  if (!withinMonthlyBudget(run.used)) {
    run.skippedBudget++;
    return null;
  }
  // Counted before asking: a query that fails still spends accesses.
  run.used++;
  run.queries++;
  await db.from("_clara_config").upsert({ key: run.key, value: String(run.used), updated_at: new Date().toISOString() });

  try {
    const res = await fetch(closestLightningUrl(sub.lat, sub.lng, GLM_NEAR_RADIUS_KM), {
      signal: AbortSignal.timeout(XWEATHER_TIMEOUT_MS),
    });
    const body = (await res.json()) as { success?: boolean; error?: { code?: string } | null };
    if (body?.success !== true) {
      log.info({ event: "lightning_alerts.xweather_error", chatId: sub.chat_id, code: body?.error?.code });
    }
    const distances = parseLightningResponse(body)
      .filter((strike) => strike.type === "cg" && strike.distanceKm !== null)
      .map((strike) => strike.distanceKm as number);
    if (distances.length === 0) return null;
    run.confirmed++;
    return Math.min(...distances);
  } catch (err) {
    log.info({
      event: "lightning_alerts.xweather_failed",
      chatId: sub.chat_id,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function glmMessage(
  cityName: string,
  near: Array<Flash & { distKm: number }>,
  dry: DryConditions,
  now: Date,
  groundStrikeKm: number | null
): string {
  const nearest = near[0];
  const minutesAgo = Math.max(0, Math.round((now.getTime() - Date.parse(nearest.flashAt)) / 60000));
  const others = near.length > 1 ? ` · ${near.length} rayos en ${GLM_NEAR_RADIUS_KM} km` : "";
  return (
    `⚡ <b>Clara — Rayo con tormenta seca</b>\n\n` +
    `📍 <b>${escapeHtml(cityName)}</b>\n` +
    `⚡ Rayo detectado a ~${Math.round(nearest.distKm)} km (hace ${minutesAgo} min)${others}\n` +
    (groundStrikeKm !== null ? `⚡ Rayo nube-tierra confirmado a ~${Math.round(groundStrikeKm)} km\n` : "") +
    `💧 Humedad: ${Math.round(dry.humidity ?? 0)}%\n` +
    `🌧 Lluvia última hora: ${(dry.recentRainMm ?? 0).toFixed(1)} mm\n\n` +
    `Un rayo con aire seco puede iniciar un incendio. Prestá atención a los próximos minutos.\n\n` +
    `Usa /rayos para activar/desactivar este tipo de alerta.\n\n` +
    `—\nClara · AlertaForestal.org\n` +
    `<i>Datos: NOAA GOES-19 (GLM) · Open-Meteo` +
    (groundStrikeKm !== null ? ` · <a href="https://www.xweather.com">${XWEATHER_ATTRIBUTION}</a>` : "") +
    `</i>`
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
