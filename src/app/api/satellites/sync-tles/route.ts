import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { VIIRS_NORAD_IDS } from "@/lib/satellites";
import { isCronAuthorized } from "@/lib/cron-auth";

/**
 * GET /api/satellites/sync-tles
 *
 * WHI-753 — Refresca TLEs (Two-Line Elements) de los satélites VIIRS desde
 * CelesTrak y los upsertea en `satellite_tles`. Trigger: pg_cron diario
 * (`satellites-sync-tles` a las 04:30 UTC = 01:30 ART).
 *
 * El resultado lo usa `computeNextPassOverArgentina()` para el badge del hero.
 */

const CELESTRAK_BASE = "https://celestrak.org/NORAD/elements/gp.php";
const USER_AGENT = "AlertaForestal https://alertaforestal.org";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  const noradIds = Object.values(VIIRS_NORAD_IDS);
  const updated: number[] = [];
  const failed: Array<{ norad_id: number; reason: string }> = [];

  for (const noradId of noradIds) {
    try {
      const url = `${CELESTRAK_BASE}?CATNR=${noradId}&FORMAT=tle`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        failed.push({ norad_id: noradId, reason: `celestrak_http_${res.status}` });
        continue;
      }

      const text = (await res.text()).trim();
      // CelesTrak returns "No GP data found" body with HTTP 200 when the
      // catalog number is invalid or the satellite has decayed.
      if (text.startsWith("No GP data")) {
        failed.push({ norad_id: noradId, reason: "no_gp_data" });
        continue;
      }

      const [name, line1, line2] = text.split(/\r?\n/).map((s) => s.trim());
      if (!name || !line1?.startsWith("1 ") || !line2?.startsWith("2 ")) {
        failed.push({ norad_id: noradId, reason: "malformed_tle" });
        continue;
      }

      const { error } = await db.from("satellite_tles").upsert({
        norad_id: noradId,
        name,
        line1,
        line2,
        fetched_at: new Date().toISOString(),
      });

      if (error) {
        console.error(`sync-tles upsert ${noradId} failed:`, error);
        failed.push({ norad_id: noradId, reason: "db_upsert_failed" });
        continue;
      }

      updated.push(noradId);
    } catch (error) {
      console.error(`sync-tles ${noradId} threw:`, error);
      failed.push({ norad_id: noradId, reason: "exception" });
    }
  }

  return NextResponse.json({
    updated,
    failed,
    fetched_at: new Date().toISOString(),
  });
}
