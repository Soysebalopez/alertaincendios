/**
 * Pure summaries behind two panels of the Bahía Blanca page (WHI-907 part 9):
 * recent GOES-19 GLM lightning and the wind measured at the airport. Neither
 * may show a reassuring number built on stale data.
 */
import { BAHIA_BLANCA } from "@/lib/bahia-blanca";
import { haversineKm } from "@/lib/geo";
import { GLM_NEAR_RADIUS_KM, glmDataIsFresh } from "@/lib/lightning-near";
import { cardinalToSpanish, degreesToCardinal } from "@/lib/wind";

export const BAHIA_LIGHTNING_RADIUS_KM = GLM_NEAR_RADIUS_KM;
export const BAHIA_LIGHTNING_WINDOW_HOURS = 3;
export const AIRPORT_WIND_MAX_AGE_MINUTES = 180;

export interface FlashRow {
  flash_at: string;
  lat: number;
  lng: number;
}

export interface LightningSummary {
  count: number;
  nearestKm: number | null;
  minutesSinceLatest: number | null;
}

export function lightningSummary(input: {
  flashes: FlashRow[];
  heartbeatAt: string | null;
  now: Date;
}): LightningSummary | null {
  // A quiet sky and a dead sync both store zero flashes: only the heartbeat
  // of the GLM sync tells them apart.
  if (!glmDataIsFresh(input.heartbeatAt, input.now)) return null;

  const windowStart = input.now.getTime() - BAHIA_LIGHTNING_WINDOW_HOURS * 3_600_000;
  let count = 0;
  let nearestKm = Infinity;
  let latestMs = -Infinity;
  for (const flash of input.flashes) {
    const at = Date.parse(flash.flash_at);
    if (Number.isNaN(at) || at < windowStart) continue;
    const km = haversineKm(BAHIA_BLANCA.lat, BAHIA_BLANCA.lng, flash.lat, flash.lng);
    if (km > BAHIA_LIGHTNING_RADIUS_KM) continue;
    count += 1;
    nearestKm = Math.min(nearestKm, km);
    latestMs = Math.max(latestMs, at);
  }

  if (count === 0) return { count: 0, nearestKm: null, minutesSinceLatest: null };
  return {
    count,
    nearestKm: Math.round(nearestKm * 10) / 10,
    minutesSinceLatest: Math.max(0, Math.round((input.now.getTime() - latestMs) / 60_000)),
  };
}

export interface AirportWindRow {
  observed_at: string;
  /** Direction the wind blows FROM; null when the METAR says variable. */
  wind_from_deg: number | null;
  wind_kmh: number;
  gust_kmh: number | null;
  variable: boolean;
}

export interface AirportWindSummary {
  minutesAgo: number;
  windKmh: number;
  gustKmh: number | null;
  /** Spanish cardinal the wind comes from, or "variable". */
  fromLabel: string;
}

export function airportWindSummary(
  row: AirportWindRow | null,
  now: Date,
  maxAgeMinutes: number = AIRPORT_WIND_MAX_AGE_MINUTES,
): AirportWindSummary | null {
  if (!row) return null;
  const observedMs = Date.parse(row.observed_at);
  if (Number.isNaN(observedMs)) return null;
  const minutesAgo = Math.round((now.getTime() - observedMs) / 60_000);
  if (minutesAgo > maxAgeMinutes) return null;

  return {
    minutesAgo: Math.max(0, minutesAgo),
    windKmh: Math.round(row.wind_kmh),
    gustKmh: row.gust_kmh == null ? null : Math.round(row.gust_kmh),
    fromLabel:
      row.variable || row.wind_from_deg == null
        ? "variable"
        : cardinalToSpanish(degreesToCardinal(row.wind_from_deg)),
  };
}
