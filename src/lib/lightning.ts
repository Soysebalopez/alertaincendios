/**
 * Lightning risk detection — WHI-543.
 *
 * Strategy: OpenWeather One Call 3.0 (alerts + current weather codes) is the
 * primary signal; Open-Meteo (free, no key) is the fallback. Neither is a
 * true strike-level feed — that requires paid services (Vaisala, Xweather,
 * Blitzortung). The Phase 3 plan (WHI-548) is to migrate to NOAA GLM for
 * strike-level data once GOES is integrated.
 *
 * "Fire risk lightning" = thunderstorm activity over dry conditions (low
 * humidity + no recent rain). Wet storms put fires out; dry storms start
 * them. We only alert on dry storms.
 */
import { fetchWind } from "./wind";

export interface LightningRisk {
  hasThunderstorm: boolean;
  hasFireRisk: boolean;
  humidity: number; // %
  recentRainMm: number;
  description: string;
  source: "openweather" | "open-meteo";
}

// WMO weather codes that indicate thunderstorm activity
// (Open-Meteo uses WMO; codes 95-99 = thunderstorm)
const WMO_THUNDERSTORM = new Set([95, 96, 99]);

// OpenWeather condition codes 200-232 = thunderstorm group
function isOwmThunderstorm(code: number): boolean {
  return code >= 200 && code <= 232;
}

// Dry storm thresholds — humidity below this and no rain in last 6h means
// any thunderstorm is high fire risk.
const DRY_HUMIDITY_THRESHOLD = 60;
const DRY_RAIN_THRESHOLD_MM = 0.5;

export async function fetchLightningRisk(
  lat: number,
  lng: number
): Promise<LightningRisk> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (apiKey) {
    try {
      return await fetchFromOpenWeather(lat, lng, apiKey);
    } catch (e) {
      console.error("OpenWeather lightning error:", e);
    }
  }
  return fetchFromOpenMeteo(lat, lng);
}

async function fetchFromOpenWeather(
  lat: number,
  lng: number,
  apiKey: string
): Promise<LightningRisk> {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,daily&units=metric&appid=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`OWM ${res.status}`);
  const data = await res.json();

  const currentCode: number = data.current?.weather?.[0]?.id ?? 800;
  const humidity: number = data.current?.humidity ?? 50;
  const recentRainMm: number = data.current?.rain?.["1h"] ?? 0;

  const hasThunderstorm =
    isOwmThunderstorm(currentCode) ||
    (data.hourly ?? [])
      .slice(0, 3)
      .some((h: { weather?: { id: number }[] }) =>
        isOwmThunderstorm(h.weather?.[0]?.id ?? 800)
      ) ||
    (data.alerts ?? []).some((a: { event?: string; tags?: string[] }) =>
      mentionsThunder(a.event ?? "", a.tags ?? [])
    );

  const hasFireRisk =
    hasThunderstorm &&
    humidity < DRY_HUMIDITY_THRESHOLD &&
    recentRainMm < DRY_RAIN_THRESHOLD_MM;

  return {
    hasThunderstorm,
    hasFireRisk,
    humidity,
    recentRainMm,
    description: describe(hasThunderstorm, hasFireRisk, humidity, recentRainMm),
    source: "openweather",
  };
}

async function fetchFromOpenMeteo(
  lat: number,
  lng: number
): Promise<LightningRisk> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=weather_code,relative_humidity_2m,precipitation&hourly=weather_code&past_hours=6&forecast_hours=3`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = await res.json();

    const currentCode: number = data.current?.weather_code ?? 0;
    const humidity: number = data.current?.relative_humidity_2m ?? 50;
    const recentRainMm: number = data.current?.precipitation ?? 0;

    const hourly: number[] = data.hourly?.weather_code ?? [];
    const hasThunderstorm =
      WMO_THUNDERSTORM.has(currentCode) ||
      hourly.some((c) => WMO_THUNDERSTORM.has(c));

    const hasFireRisk =
      hasThunderstorm &&
      humidity < DRY_HUMIDITY_THRESHOLD &&
      recentRainMm < DRY_RAIN_THRESHOLD_MM;

    return {
      hasThunderstorm,
      hasFireRisk,
      humidity,
      recentRainMm,
      description: describe(hasThunderstorm, hasFireRisk, humidity, recentRainMm),
      source: "open-meteo",
    };
  } catch (e) {
    console.error("Open-Meteo lightning fallback error:", e);
    // Last resort: pull only humidity/temp from existing wind helper so we
    // can still produce a quiet "no risk" answer instead of throwing.
    const wind = await fetchWind(lat, lng).catch(() => null);
    return {
      hasThunderstorm: false,
      hasFireRisk: false,
      humidity: wind ? 50 : 50,
      recentRainMm: 0,
      description: "Sin datos de tormenta disponibles.",
      source: "open-meteo",
    };
  }
}

function mentionsThunder(event: string, tags: string[]): boolean {
  const haystack = (event + " " + tags.join(" ")).toLowerCase();
  return /thunder|storm|tormenta|relámpago|rayos/.test(haystack);
}

function describe(
  hasThunderstorm: boolean,
  hasFireRisk: boolean,
  humidity: number,
  recentRainMm: number
): string {
  if (!hasThunderstorm) return "Sin tormenta eléctrica reciente.";
  if (hasFireRisk) {
    return `Tormenta eléctrica con condiciones secas (humedad ${Math.round(humidity)}%, lluvia última hora ${recentRainMm.toFixed(1)} mm). Alto riesgo de ignición.`;
  }
  return `Tormenta eléctrica activa pero con humedad/lluvia que reduce el riesgo de ignición (humedad ${Math.round(humidity)}%, lluvia ${recentRainMm.toFixed(1)} mm).`;
}
