/**
 * Fetches current wind data for a given location from Open-Meteo (free, no key).
 */

export interface WindData {
  windSpeed: number; // km/h
  windDirection: number; // degrees
  temperature: number;
}

export async function fetchWind(lat: number, lng: number): Promise<WindData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m,temperature_2m`;

  const res = await fetch(url);
  if (!res.ok) {
    return { windSpeed: 10, windDirection: 180, temperature: 20 };
  }

  const data = await res.json();
  const current = data.current;

  return {
    windSpeed: current.wind_speed_10m ?? 10,
    windDirection: current.wind_direction_10m ?? 180,
    temperature: current.temperature_2m ?? 20,
  };
}
