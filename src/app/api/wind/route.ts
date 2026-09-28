import { NextRequest, NextResponse } from "next/server";
import { degreesToCardinal, cardinalToSpanish } from "@/lib/wind";
import { openMeteoUrl } from "@/lib/open-meteo";
import {
  checkRateLimit,
  clientIp,
  isInternalCall,
  rateLimitHeaders,
} from "@/lib/ratelimit";

/**
 * GET /api/wind?lat=-34.6&lng=-58.38
 *
 * Returns current wind data for any location using Open-Meteo.
 */

// H-10 — protege la cuota de Open-Meteo. 60 req/min por IP es generoso para
// uso real (todo el grid de 12 ciudades en el hero cuenta como 12), pero corta
// loops de abuso. /api/summary llama internamente — usa el bypass header.
/**
 * Vercel's CDN may reuse a good answer for 10 minutes, per point (the query
 * string is part of the key), for EVERY visitor (review 28/9). The upstream
 * call is already cached 30 min (`revalidate: 1800` below), so this adds no
 * staleness — it only stops each visitor from running the function again.
 * The /mapa page alone asks for 78 cities; before this, a reload inside the
 * same minute hit the per-IP limit and cities silently dropped off the map.
 * A reused answer never reaches the function, so it never counts toward it.
 */
const CACHE_CDN = "public, s-maxage=600, stale-while-revalidate=1200";

const RATE_LIMIT_PER_MIN = 60;

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 },
    );
  }

  if (!isInternalCall(request)) {
    const rl = await checkRateLimit({
      key: clientIp(request),
      limit: RATE_LIMIT_PER_MIN,
      windowSec: 60,
      namespace: "wind",
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: rateLimitHeaders(rl, RATE_LIMIT_PER_MIN) },
      );
    }
  }

  try {
    const url = openMeteoUrl("forecast", {
      latitude: lat,
      longitude: lng,
      current:
        "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
      timezone: "America/Argentina/Buenos_Aires",
    });

    const res = await fetch(url, {
      next: { revalidate: 1800 },
    });

    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);

    const data = await res.json();
    const c = data.current;
    const dirLabel = degreesToCardinal(c.wind_direction_10m);

    return NextResponse.json({
      source: "open-meteo",
      updated: c.time,
      windSpeed: c.wind_speed_10m,
      windDirection: c.wind_direction_10m,
      windDirectionLabel: dirLabel,
      windDirectionLabelEs: cardinalToSpanish(dirLabel),
      windGusts: c.wind_gusts_10m,
      temperature: c.temperature_2m,
      humidity: c.relative_humidity_2m,
      weatherCode: c.weather_code,
    }, { headers: { "Cache-Control": CACHE_CDN } });
  } catch (error) {
    console.error("Wind API error:", error);
    return NextResponse.json(
      { error: "No se pudieron obtener datos de viento" },
      { status: 502 },
    );
  }
}
