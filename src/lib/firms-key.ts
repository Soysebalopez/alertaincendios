/**
 * FIRMS MAP_KEY helpers — pure + fetch-only, safe to import from tests and
 * from the Telegram webhook. Deliberately NOT in firms.ts: that module pulls
 * in server-only forest polygons and cannot be loaded by vitest.
 *
 * NASA quirk this module exists for: application errors ("Invalid MAP_KEY.",
 * rate-limit text, maintenance HTML) arrive with HTTP 200. The only reliable
 * validity signal is the body itself — real area CSV always starts with the
 * "latitude,longitude,..." header.
 */

export const FIRMS_MAP_KEY_FORM_URL = "https://firms.modaps.eosdis.nasa.gov/api/map_key/";

/** True iff the body looks like FIRMS area CSV (header present). */
export function isFirmsCsvBody(body: string | null | undefined): boolean {
  return Boolean(body && body.trimStart().startsWith("latitude"));
}

/**
 * Live-validates a candidate MAP_KEY against NASA with a tiny 1-day bbox
 * request. `message` carries NASA's response snippet on rejection so the
 * caller can show the exact reason ("Invalid MAP_KEY.", rate limit, ...).
 */
export async function validateMapKey(
  key: string
): Promise<{ valid: boolean; message: string }> {
  // Small bbox (Buenos Aires surroundings) — the error body is bbox-independent
  // and a small window keeps the success payload tiny.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(
    key
  )}/VIIRS_SNPP_NRT/-59.0,-35.5,-57.5,-34.0/1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    if (res.ok && isFirmsCsvBody(body)) return { valid: true, message: "" };
    return { valid: false, message: body.slice(0, 200) || `HTTP ${res.status}` };
  } catch (err) {
    return {
      valid: false,
      message: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
