/**
 * Wind utilities — direction conversion and data fetching.
 */

import { openMeteoUrl } from "@/lib/open-meteo";
import { getSupabase } from "@/lib/supabase";
import { pickForecastRow, smnCovers, type ForecastRow } from "@/lib/wind-forecast";

export type WindSource = "smn-wrf" | "open-meteo" | "fallback";

export interface WindData {
  windSpeed: number; // km/h
  windDirection: number; // degrees, the direction the wind blows FROM
  temperature: number;
  /** % — null when the source did not report it (never a made-up default). */
  relativeHumidity: number | null;
  /** Where the numbers came from; the map shows it next to the smoke cone. */
  source: WindSource;
}

/** Convert wind direction degrees to cardinal abbreviation */
export function degreesToCardinal(deg: number): string {
  const directions = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return directions[Math.round(deg / 22.5) % 16];
}

/** Convert cardinal abbreviation to Spanish */
export function cardinalToSpanish(cardinal: string): string {
  const map: Record<string, string> = {
    N: "Norte", NNE: "Nor-noreste", NE: "Noreste", ENE: "Este-noreste",
    E: "Este", ESE: "Este-sureste", SE: "Sureste", SSE: "Sur-sureste",
    S: "Sur", SSW: "Sur-suroeste", SW: "Suroeste", WSW: "Oeste-suroeste",
    W: "Oeste", WNW: "Oeste-noroeste", NW: "Noroeste", NNW: "Nor-noroeste",
  };
  return map[cardinal] || cardinal;
}

// Return a fresh object each time (not a shared reference) so a caller that
// caches/mutates the result can't corrupt the fallback for everyone else.
function windFallback(): WindData {
  return { windSpeed: 10, windDirection: 180, temperature: 20, relativeHumidity: null, source: "fallback" };
}

// Rows are hourly. ±1 h around now and ±0.2° (~20 km) around the point keep
// the query to a few hundred rows of the ~180 cells stored per hour.
const SMN_WINDOW_MS = 60 * 60_000;
const SMN_BOX_DEG = 0.2;

async function smnWind(lat: number, lng: number, now: Date): Promise<WindData | null> {
  try {
    const { data, error } = await getSupabase()
      .from("wind_forecast")
      .select("run_at,valid_at,lat,lng,wind_from_deg,wind_kmh,temp_c,rh_pct")
      .eq("source", "smn-wrf")
      .gte("valid_at", new Date(now.getTime() - SMN_WINDOW_MS).toISOString())
      .lte("valid_at", new Date(now.getTime() + SMN_WINDOW_MS).toISOString())
      .gte("lat", lat - SMN_BOX_DEG)
      .lte("lat", lat + SMN_BOX_DEG)
      .gte("lng", lng - SMN_BOX_DEG)
      .lte("lng", lng + SMN_BOX_DEG)
      .limit(1000);
    // A missing table (migration not applied yet) is an error here too.
    if (error || !Array.isArray(data)) return null;
    const row = pickForecastRow(data as ForecastRow[], lat, lng, now);
    if (!row || typeof row.temp_c !== "number") return null;
    return {
      windSpeed: row.wind_kmh,
      windDirection: row.wind_from_deg,
      temperature: row.temp_c,
      relativeHumidity: typeof row.rh_pct === "number" ? row.rh_pct : null,
      source: "smn-wrf",
    };
  } catch {
    return null;
  }
}

/**
 * Current wind for a location: the SMN WRF 4 km forecast near Bahía Blanca,
 * Open-Meteo elsewhere or when there is no usable SMN row, fallback values on
 * error/timeout.
 */
export async function fetchWind(lat: number, lng: number, now: Date = new Date()): Promise<WindData> {
  if (smnCovers(lat, lng)) {
    const smn = await smnWind(lat, lng, now);
    if (smn) return smn;
  }

  const url = openMeteoUrl("forecast", {
    latitude: lat,
    longitude: lng,
    current: "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m",
  });

  try {
    // Timeout so a hung Open-Meteo doesn't stall the alert-fan-out cron.
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return windFallback();

    const data = await res.json();
    const current = data.current;

    return {
      windSpeed: current?.wind_speed_10m ?? 10,
      windDirection: current?.wind_direction_10m ?? 180,
      temperature: current?.temperature_2m ?? 20,
      relativeHumidity:
        typeof current?.relative_humidity_2m === "number" ? current.relative_humidity_2m : null,
      source: "open-meteo",
    };
  } catch {
    return windFallback();
  }
}
