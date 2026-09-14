import { NextRequest, NextResponse } from "next/server";
import { projectFire } from "@/lib/fire-projection";
import { fetchWind } from "@/lib/wind";
import {
  checkRateLimit,
  clientIp,
  isInternalCall,
  rateLimitHeaders,
} from "@/lib/ratelimit";

/**
 * GET /api/fire-projection?lat=-38.6&lng=-62.4&confirmed=1
 *
 * Smoke sector for one fire and, when it is confirmed (FIRMS) and the CSIRO
 * grassfire rule applies, fire-front isochrones — as GeoJSON for the city map
 * (WHI-907 part 11). Without `confirmed=1` it is a GOES preliminary: smoke
 * only, marked as a possible fire. Every shape expires an hour after issue.
 */

// Same budget as /api/wind: each call spends one wind lookup, and the city map
// asks once per nearby fire.
const RATE_LIMIT_PER_MIN = 60;

function coordinate(raw: string | null, limit: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = coordinate(params.get("lat"), 90);
  const lng = coordinate(params.get("lng"), 180);
  if (lat === null || lng === null) {
    return NextResponse.json(
      { error: "lat and lng must be valid coordinates" },
      { status: 400 },
    );
  }

  if (!isInternalCall(request)) {
    const rl = await checkRateLimit({
      key: clientIp(request),
      limit: RATE_LIMIT_PER_MIN,
      windowSec: 60,
      namespace: "fire-projection",
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: rateLimitHeaders(rl, RATE_LIMIT_PER_MIN) },
      );
    }
  }

  const wind = await fetchWind(lat, lng);

  // The fallback wind is invented (10 km/h from the south). A cone drawn from
  // it would point people the wrong way, so draw nothing and retry soon.
  if (wind.source === "fallback") {
    return NextResponse.json(
      { type: "FeatureCollection", features: [], unavailable: "wind_unavailable" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const projection = projectFire({
    origin: { lat, lng },
    windFromDeg: wind.windDirection,
    windKmh: wind.windSpeed,
    tempC: wind.temperature,
    rhPct: wind.relativeHumidity,
    confirmed: params.get("confirmed") === "1",
    windSource: wind.source,
  });

  return NextResponse.json(projection, {
    headers: { "Cache-Control": "public, s-maxage=600" },
  });
}
