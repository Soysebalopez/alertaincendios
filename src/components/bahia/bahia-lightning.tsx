import { Lightning } from "@phosphor-icons/react/dist/ssr";
import { BAHIA_BLANCA } from "@/lib/bahia-blanca";
import {
  BAHIA_LIGHTNING_RADIUS_KM,
  BAHIA_LIGHTNING_WINDOW_HOURS,
  lightningSummary,
  type FlashRow,
} from "@/lib/bahia-panels";
import { getSupabase } from "@/lib/supabase";

// A box a little larger than the 30 km circle (1° of longitude ≈ 87 km here).
const LAT_BOX_DEG = 0.3;
const LNG_BOX_DEG = 0.4;

async function loadLightning() {
  try {
    const db = getSupabase();
    const now = new Date();
    const since = new Date(now.getTime() - BAHIA_LIGHTNING_WINDOW_HOURS * 3_600_000).toISOString();
    const [heartbeat, flashes] = await Promise.all([
      db.from("_clara_config").select("value").eq("key", "glm_last_sync_at").maybeSingle(),
      db
        .from("lightning_flashes")
        .select("flash_at,lat,lng")
        .gte("flash_at", since)
        .gte("lat", BAHIA_BLANCA.lat - LAT_BOX_DEG)
        .lte("lat", BAHIA_BLANCA.lat + LAT_BOX_DEG)
        .gte("lng", BAHIA_BLANCA.lng - LNG_BOX_DEG)
        .lte("lng", BAHIA_BLANCA.lng + LNG_BOX_DEG)
        .limit(1000),
    ]);
    // A missing table (migration pending) or any database error: show nothing.
    if (flashes.error || heartbeat.error) return null;
    const heartbeatAt = typeof heartbeat.data?.value === "string" ? heartbeat.data.value : null;
    return lightningSummary({ flashes: (flashes.data ?? []) as FlashRow[], heartbeatAt, now });
  } catch {
    return null;
  }
}

/**
 * Lightning of the last hours around Bahía Blanca, from our GOES-19 GLM table
 * (WHI-907 part 2). Renders nothing until the table exists and the sync is
 * alive: "sin rayos" on a dead sync would be a false reassurance.
 */
export async function BahiaLightning() {
  const summary = await loadLightning();
  if (!summary) return null;

  return (
    <div
      className="border border-border rounded-xl"
      style={{ padding: "20px 24px", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2">
        <Lightning size={14} weight="duotone" />
        <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
          Rayos · últimas {BAHIA_LIGHTNING_WINDOW_HOURS} h
        </span>
      </div>
      {summary.count === 0 ? (
        <p className="mt-2 m-0" style={{ fontSize: 15, fontWeight: 500, color: "var(--good)" }}>
          Sin rayos a menos de {BAHIA_LIGHTNING_RADIUS_KM} km
        </p>
      ) : (
        <p className="mt-2 m-0" style={{ fontSize: 15, fontWeight: 500 }}>
          {summary.count} {summary.count === 1 ? "rayo" : "rayos"} a menos de {BAHIA_LIGHTNING_RADIUS_KM} km · el
          más cercano a {summary.nearestKm} km · el último hace {summary.minutesSinceLatest} min
        </p>
      )}
      <p className="mt-1 font-mono text-[11px] text-muted">
        NOAA GOES-19 (GLM) · ubica cada rayo con un margen de 8 a 14 km
      </p>
    </div>
  );
}
