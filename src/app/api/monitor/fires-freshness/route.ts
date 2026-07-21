import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage, escapeHtml } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { decideMonitorActions } from "@/lib/fires-freshness";
import { FIRMS_MAP_KEY_FORM_URL } from "@/lib/firms-key";

const THRESHOLD_MINUTES = 60;

/**
 * GET /api/monitor/fires-freshness
 *
 * Cron monitor (pg_cron `fires-freshness-monitor`, every 15 min). Two signals:
 * - `firms_sync_error` in _clara_config (written by the SQL body guard when
 *   NASA returns a non-CSV body, e.g. "Invalid MAP_KEY.") → specific one-shot
 *   Telegram alert with rotation instructions. Supersedes the generic alert.
 * - fires_cache.fetched_at older than THRESHOLD_MINUTES → generic staleness
 *   alert (cron/pg_net down, etc).
 * Anti-spam flags and admin_chat_id live in _clara_config. Gated by CRON_SECRET.
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
    .in("key", [
      "admin_chat_id",
      "fires_freshness_alerted_at",
      "firms_sync_error",
      "firms_key_alerted_at",
      "firms_map_key",
    ]);

  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const adminChatId = cfg["admin_chat_id"];
  const keyError = cfg["firms_sync_error"];

  const fetchedAt = cache?.fetched_at ? new Date(cache.fetched_at) : null;
  // No row / no timestamp = treat as maximally stale (data is missing = a problem).
  const ageMinutes = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 60000 : Number.POSITIVE_INFINITY;

  const { freshness, key } = decideMonitorActions({
    ageMinutes,
    thresholdMinutes: THRESHOLD_MINUTES,
    staleAlerted: Boolean(cfg["fires_freshness_alerted_at"]),
    hasKeyError: Boolean(keyError),
    keyAlerted: Boolean(cfg["firms_key_alerted_at"]),
  });

  const stale = ageMinutes > THRESHOLD_MINUTES;
  const ageOut = Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null;

  if (freshness === "none" && key === "none") {
    return NextResponse.json({ ageMinutes: ageOut, stale, freshness, key, notified: false });
  }

  if (!adminChatId) {
    // Monitor works but cannot notify until admin_chat_id is set in _clara_config.
    return NextResponse.json({
      ageMinutes: ageOut,
      stale,
      freshness,
      key,
      notified: false,
      reason: "admin_chat_id not configured",
    });
  }

  const now = new Date().toISOString();

  // --- Key-invalidation alert (specific, supersedes staleness) ---
  if (key === "alert_key_invalid") {
    const statusSnippet = await fetchMapkeyStatus(cfg["firms_map_key"]);
    const msg =
      `🔑 <b>Clara — MAP_KEY de FIRMS inválida</b>\n\n` +
      `NASA está rechazando los pedidos de focos:\n` +
      `<code>${escapeHtml(keyError)}</code>\n\n` +
      (statusSnippet
        ? `Chequeo directo del estado de la key:\n<code>${escapeHtml(statusSnippet)}</code>\n\n`
        : "") +
      `El sitio quedó congelado en el último dato bueno (no se pierde nada).\n\n` +
      `<b>Para arreglarlo:</b>\n` +
      `1. Pedí una key nueva (llega por mail): ${FIRMS_MAP_KEY_FORM_URL}\n` +
      `2. Cuando la tengas, mandame acá:\n<code>/rotarkey LA_KEY</code>`;
    await sendMessage(Number(adminChatId), msg);
    await db.from("_clara_config").upsert({
      key: "firms_key_alerted_at",
      value: now,
      updated_at: now,
    });
  } else if (key === "alert_key_recovered") {
    await sendMessage(
      Number(adminChatId),
      `✅ <b>Clara — MAP_KEY de FIRMS operativa</b>\n\nLos syncs de focos volvieron a traer datos.`
    );
    await db.from("_clara_config").delete().eq("key", "firms_key_alerted_at");
  }

  // --- Generic staleness alert (only when no key error is active) ---
  if (freshness === "alert_stale" || freshness === "alert_recovered") {
    const ageLabel = ageOut !== null ? `${ageOut} min` : "sin dato";
    const msg =
      freshness === "alert_stale"
        ? `⚠️ <b>Clara — FIRMS sin actualizar</b>\n\n` +
          `Los focos de FIRMS no se actualizan hace <b>${ageLabel}</b>.\n` +
          `Último fetch: ${fetchedAt ? fetchedAt.toISOString() : "—"}.\n\n` +
          `No hay error de MAP_KEY marcado — revisá el cron fires-fetch / pg_net.`
        : `✅ <b>Clara — FIRMS se recuperó</b>\n\n` +
          `Los focos de FIRMS volvieron a actualizar (hace ${ageLabel}).`;
    await sendMessage(Number(adminChatId), msg);
    if (freshness === "alert_stale") {
      await db.from("_clara_config").upsert({
        key: "fires_freshness_alerted_at",
        value: now,
        updated_at: now,
      });
    } else {
      await db.from("_clara_config").delete().eq("key", "fires_freshness_alerted_at");
    }
  }

  return NextResponse.json({ ageMinutes: ageOut, stale, freshness, key, notified: true });
}

/**
 * Best-effort probe of NASA's mapkey_status endpoint to enrich the alert with
 * NASA's own words. Failures return null — the `firms_sync_error` flag is the
 * primary signal and the alert goes out regardless.
 */
async function fetchMapkeyStatus(mapKey: string | undefined): Promise<string | null> {
  if (!mapKey) return null;
  try {
    const res = await fetch(
      `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(mapKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const text = (await res.text()).trim();
    return text ? text.slice(0, 200) : null;
  } catch {
    return null;
  }
}
