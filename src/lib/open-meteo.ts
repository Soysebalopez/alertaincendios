/**
 * Single place that builds Open-Meteo URLs (WHI-907 part 1).
 *
 * The free plan forbids commercial use. Setting OPEN_METEO_API_KEY switches
 * every call to the customer hosts with `apikey=` — no code change needed.
 * Without the variable, URLs are exactly the free ones used before.
 */
export type OpenMeteoApi = "forecast" | "air-quality" | "archive" | "geocoding";

const ENDPOINTS: Record<OpenMeteoApi, { host: string; path: string }> = {
  forecast: { host: "api.open-meteo.com", path: "/v1/forecast" },
  "air-quality": { host: "air-quality-api.open-meteo.com", path: "/v1/air-quality" },
  archive: { host: "archive-api.open-meteo.com", path: "/v1/archive" },
  geocoding: { host: "geocoding-api.open-meteo.com", path: "/v1/search" },
};

/**
 * @param apiKey `undefined` reads OPEN_METEO_API_KEY from the environment;
 *   `null` forces the free plan (used by tests).
 */
export function openMeteoUrl(
  api: OpenMeteoApi,
  params: Record<string, string | number | boolean>,
  apiKey?: string | null
): string {
  const raw = apiKey === undefined ? process.env.OPEN_METEO_API_KEY : apiKey;
  const key = raw?.trim() || null;
  const { host, path } = ENDPOINTS[api];
  const url = new URL(`https://${key ? `customer-${host}` : host}${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }
  if (key) url.searchParams.set("apikey", key);
  return url.toString();
}
