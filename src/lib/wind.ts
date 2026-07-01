/**
 * Wind utilities — direction conversion and data fetching.
 */

export interface WindData {
  windSpeed: number; // km/h
  windDirection: number; // degrees
  temperature: number;
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
  return { windSpeed: 10, windDirection: 180, temperature: 20 };
}

/** Fetch current wind for a location (fallback values on error/timeout) */
export async function fetchWind(lat: number, lng: number): Promise<WindData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m,temperature_2m`;

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
    };
  } catch {
    return windFallback();
  }
}
