/**
 * Geocoding helpers.
 *
 * `geocodeCity` resolves a city NAME to coordinates (Open-Meteo, restricted to
 * Argentina). `reverseGeocode` goes the other way — Open-Meteo has no reverse
 * endpoint, so it uses BigDataCloud's key-less reverse client.
 */

interface GeoResult {
  lat: number;
  lng: number;
  name: string;
  admin1: string; // province
}

/**
 * Resolves coordinates to a place name. Callers must treat null as "no name
 * available" and fall back to the raw coordinates — never as "not covered":
 * coverage is decided offline by `isInArgentina`, not by this service.
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoResult | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=es`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const name = data.locality || data.city;
    if (!name) return null;

    return {
      lat,
      lng,
      name,
      admin1: data.principalSubdivision || "",
    };
  } catch {
    return null;
  }
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
