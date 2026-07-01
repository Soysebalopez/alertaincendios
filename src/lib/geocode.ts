/**
 * Geocodes a city name to lat/lng using Open-Meteo Geocoding API (free, no key).
 * Returns the best match for Argentina, or null.
 */

interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  admin1: string; // province
}

export async function geocodeCity(query: string): Promise<GeoResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=es&country_code=AR`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results;
    if (!results || results.length === 0) return null;

    const best = results[0];
    return {
      lat: best.latitude,
      lng: best.longitude,
      name: best.name,
      admin1: best.admin1 || "",
    };
  } catch {
    return null;
  }
}
