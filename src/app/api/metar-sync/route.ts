import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isCronAuthorized } from "@/lib/cron-auth";
import { parseMetarRecord, type WindObservation } from "@/lib/metar";
import { log } from "@/lib/logger";

/**
 * GET /api/metar-sync
 *
 * WHI-907 part 4 — stores the observed wind at Bahía Blanca airport (SAZB)
 * from aviationweather.gov. Measured wind is what tells us how far off the
 * forecast is in Bahía Blanca, and what the city page shows as "viento real".
 *
 * Trigger: pg_cron hourly (scheduled after merge, checkpoint C5).
 * `wind_observations` exists only after the migration is approved (C2): until
 * then the cron answers 200 with `skipped: "table_missing"` instead of failing.
 */
const STATIONS = ["SAZB"];
const METAR_URL = "https://aviationweather.gov/api/data/metar";
const USER_AGENT = "AlertaForestal https://alertaforestal.org";
// "Table does not exist" as reported by PostgREST (schema cache) and Postgres.
const TABLE_MISSING_CODES = new Set(["PGRST205", "42P01"]);

function toRow(o: WindObservation) {
  return {
    station: o.station,
    observed_at: o.observedAt,
    wind_from_deg: o.windFromDeg,
    wind_kmh: o.windKmh,
    gust_kmh: o.gustKmh,
    variable: o.variable,
  };
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let records: unknown;
  try {
    const res = await fetch(`${METAR_URL}?ids=${STATIONS.join(",")}&format=json&hours=3`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      log.error({ event: "metar_sync.upstream_failed", status: res.status });
      return NextResponse.json({ error: "upstream_failed", status: res.status }, { status: 502 });
    }
    records = await res.json();
  } catch (err) {
    log.error({
      event: "metar_sync.fetch_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  const observations = (Array.isArray(records) ? records : [])
    .map((record) => parseMetarRecord(record))
    .filter((o): o is WindObservation => o !== null);
  if (observations.length === 0) {
    return NextResponse.json({ stored: 0, reason: "no_observations" });
  }

  const { error } = await getSupabase()
    .from("wind_observations")
    .upsert(observations.map(toRow), { onConflict: "station,observed_at" });

  if (error) {
    if (TABLE_MISSING_CODES.has(error.code)) {
      log.warn({ event: "metar_sync.table_missing" });
      return NextResponse.json({ stored: 0, skipped: "table_missing" });
    }
    log.error({ event: "metar_sync.upsert_failed", code: error.code, err: error.message });
    return NextResponse.json({ error: "db_upsert_failed" }, { status: 500 });
  }

  return NextResponse.json({ stored: observations.length, stations: STATIONS });
}
