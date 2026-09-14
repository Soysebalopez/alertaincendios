/**
 * Optional Xweather (Vaisala) lightning confirmation (WHI-907 part 3).
 *
 * GOES-19 GLM says a flash happened within ~8–14 km, but not whether it hit
 * the ground. Xweather's `lightning/closest` answers that (pulse type "cg" =
 * cloud-to-ground) and locates it within ~1 km. Free "Developer" plan: 15,000
 * accesses a month, attribution required. Everything here is inert without
 * credentials: XWEATHER_API_KEY (the portal's single key,
 * `<client_id>_<client_secret>`) or XWEATHER_CLIENT_ID + XWEATHER_CLIENT_SECRET.
 *
 * ⚠️ How many accesses one lightning query costs is not published for the free
 * plan. Until it is verified at sign-up we assume 10
 * (XWEATHER_ACCESSES_PER_LIGHTNING_QUERY) and keep 10% of the month in reserve.
 */
type Env = Record<string, string | undefined>;

const ENDPOINT = "https://data.api.xweather.com/lightning/closest";
const DEFAULT_MONTHLY_ACCESSES = 15_000;
const DEFAULT_ACCESSES_PER_QUERY = 10;
const BUDGET_SHARE = 0.9;
export const XWEATHER_ATTRIBUTION = "powered by Vaisala Xweather";

export interface Strike {
  at: string;
  lat: number;
  lng: number;
  type: "cg" | "ic" | null;
  peakAmp: number | null;
  distanceKm: number | null;
}

interface RawStrike {
  loc?: { lat?: unknown; long?: unknown };
  ob?: { dateTimeISO?: unknown; pulse?: { type?: unknown; peakamp?: unknown } };
  relativeTo?: { distanceKM?: unknown };
}

function credential(env: Env, name: string): string | null {
  return env[name]?.trim() || null;
}

/** The separate id and secret, or the portal's single key split at its first underscore. */
function credentials(env: Env): { id: string; secret: string } | null {
  const id = credential(env, "XWEATHER_CLIENT_ID");
  const secret = credential(env, "XWEATHER_CLIENT_SECRET");
  if (id && secret) return { id, secret };
  const key = credential(env, "XWEATHER_API_KEY");
  const cut = key ? key.indexOf("_") : -1;
  if (!key || cut <= 0 || cut === key.length - 1) return null;
  return { id: key.slice(0, cut), secret: key.slice(cut + 1) };
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function xweatherConfigured(env: Env = process.env): boolean {
  return credentials(env) !== null;
}

/** Cloud-to-ground strikes of the last 5 minutes within `radiusKm` of a point. */
export function closestLightningUrl(lat: number, lng: number, radiusKm: number, env: Env = process.env): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("p", `${lat},${lng}`);
  url.searchParams.set("radius", `${radiusKm}km`);
  url.searchParams.set("filter", "cg");
  url.searchParams.set("limit", "10");
  const creds = credentials(env);
  url.searchParams.set("client_id", creds?.id ?? "");
  url.searchParams.set("client_secret", creds?.secret ?? "");
  return url.toString();
}

export function parseLightningResponse(json: unknown): Strike[] {
  if (!json || typeof json !== "object") return [];
  const body = json as { success?: unknown; response?: unknown };
  if (body.success !== true || !Array.isArray(body.response)) return [];

  const strikes: Strike[] = [];
  for (const item of body.response as RawStrike[]) {
    const lat = item?.loc?.lat;
    const lng = item?.loc?.long;
    const at = item?.ob?.dateTimeISO;
    if (typeof lat !== "number" || typeof lng !== "number" || typeof at !== "string") continue;
    const pulseType = item.ob?.pulse?.type;
    const peakAmp = item.ob?.pulse?.peakamp;
    const distanceKm = item.relativeTo?.distanceKM;
    strikes.push({
      at,
      lat,
      lng,
      type: pulseType === "cg" || pulseType === "ic" ? pulseType : null,
      peakAmp: typeof peakAmp === "number" ? peakAmp : null,
      distanceKm: typeof distanceKm === "number" ? distanceKm : null,
    });
  }
  return strikes;
}

/** Lightning queries allowed per month (90% of the plan ÷ accesses per query). */
export function monthlyQueryLimit(env: Env = process.env): number {
  const monthly = positiveNumber(env.XWEATHER_MONTHLY_ACCESSES, DEFAULT_MONTHLY_ACCESSES);
  const perQuery = positiveNumber(env.XWEATHER_ACCESSES_PER_LIGHTNING_QUERY, DEFAULT_ACCESSES_PER_QUERY);
  return Math.floor((monthly * BUDGET_SHARE) / perQuery);
}

export function withinMonthlyBudget(queriesUsedThisMonth: number, env: Env = process.env): boolean {
  return queriesUsedThisMonth < monthlyQueryLimit(env);
}
