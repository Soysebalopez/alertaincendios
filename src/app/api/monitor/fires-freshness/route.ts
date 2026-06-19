import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { decideFreshnessAction } from "@/lib/fires-freshness";

const THRESHOLD_MINUTES = 60;

/**
 * GET /api/monitor/fires-freshness
 *
 * Cron monitor: alert the admin on Telegram when fires_cache stops refreshing.
 * Reads fires_cache.fetched_at + _clara_config (admin_chat_id, anti-spam flag),
 * and notifies on the stale / recovered transitions only. Gated by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();

  const { data: cache } = await db
    .from("fires_cache")
    .select("fetched_at")
    .eq("id", 1)
    .maybeSingle();

  const { data: cfgRows } = await db
    .from("_clara_config")
    .select("key, value")
    .in("key", ["admin_chat_id", "fires_freshness_alerted_at"]);

  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const adminChatId = cfg["admin_chat_id"];
  const alerted = Boolean(cfg["fires_freshness_alerted_at"]);

  const fetchedAt = cache?.fetched_at ? new Date(cache.fetched_at) : null;
  // No row / no timestamp = treat as maximally stale (data is missing = a problem).
  const ageMinutes = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 60000 : Number.POSITIVE_INFINITY;

  const action = decideFreshnessAction({ ageMinutes, thresholdMinutes: THRESHOLD_MINUTES, alerted });
  const stale = ageMinutes > THRESHOLD_MINUTES;
  const ageOut = Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null;

  if (action === "none") {
    return NextResponse.json({ ageMinutes: ageOut, stale, action, notified: false });
  }

  if (!adminChatId) {
    // Monitor works but cannot notify until admin_chat_id is set in _clara_config.
    return NextResponse.json({
      ageMinutes: ageOut,
      stale,
      action,
      notified: false,
      reason: "admin_chat_id not configured",
    });
  }

  const ageLabel = ageOut !== null ? `${ageOut} min` : "sin dato";
  const msg =
    action === "alert_stale"
      ? `⚠️ <b>Clara — FIRMS sin actualizar</b>\n\n` +
        `Los focos de FIRMS no se actualizan hace <b>${ageLabel}</b>.\n` +
        `Último fetch: ${fetchedAt ? fetchedAt.toISOString() : "—"}.\n\n` +
        `Revisá el MAP_KEY (_clara_config.firms_map_key) o el cron fires-fetch.`
      : `✅ <b>Clara — FIRMS se recuperó</b>\n\n` +
        `Los focos de FIRMS volvieron a actualizar (hace ${ageLabel}).`;

  await sendMessage(Number(adminChatId), msg);

  if (action === "alert_stale") {
    await db.from("_clara_config").upsert({
      key: "fires_freshness_alerted_at",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    await db.from("_clara_config").delete().eq("key", "fires_freshness_alerted_at");
  }

  return NextResponse.json({ ageMinutes: ageOut, stale, action, notified: true });
}
