import { NextRequest, NextResponse } from "next/server";
import {
  calculateDispersion,
  type DispersionInput,
} from "@/lib/dispersion";
import { PROVINCES } from "@/lib/argentina-cities";
import {
  checkRateLimit,
  clientIp,
  isInternalCall,
  rateLimitHeaders,
} from "@/lib/ratelimit";

const SIMULATE_LIMIT = 10;

/**
 * POST /api/simulate
 *
 * Runs a dispersion simulation from a point source.
 * Body: { source: [lng, lat], eventType, durationMinutes }
 */

export async function POST(request: NextRequest) {
  // Rate-limit FIRST (before any parsing/work) — this endpoint amplifies load
  // to Open-Meteo (via /api/wind) and is O(n) over all cities.
  if (!isInternalCall(request)) {
    const rl = await checkRateLimit({
      namespace: "simulate",
      key: clientIp(request),
      limit: SIMULATE_LIMIT,
      windowSec: 60,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Demasiadas simulaciones, probá en un minuto" },
        { status: 429, headers: rateLimitHeaders(rl, SIMULATE_LIMIT) },
      );
    }
  }

  try {
    const body = await request.json();
    const { source, eventType, durationMinutes } = body;

    if (
      !source ||
      !Array.isArray(source) ||
      source.length !== 2 ||
      !eventType
    ) {
      return NextResponse.json(
        { error: "source ([lng,lat]), eventType required" },
        { status: 400 },
      );
    }

    const [lng, lat] = source;
    const origin = new URL(request.url).origin;

    // Fetch current wind. Mark as an internal call so it bypasses /api/wind's
    // own rate limit (otherwise it counts against the user's IP budget), and
    // bound it with a timeout so a hung upstream doesn't stall the request.
    const windRes = await fetch(`${origin}/api/wind?lat=${lat}&lng=${lng}`, {
      headers: process.env.CRON_SECRET
        ? { "x-clara-internal": process.env.CRON_SECRET }
        : undefined,
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json());

    // Find nearby cities (within ~50km) for impact analysis
    const allCities = PROVINCES.flatMap((p) =>
      p.cities.map((c) => ({ ...c, province: p.name })),
    );

    const nearbyZones = allCities
      .map((c) => ({
        name: `${c.name} (${c.province})`,
        lat: c.lat,
        lng: c.lng,
        dist: Math.sqrt((c.lat - lat) ** 2 + (c.lng - lng) ** 2),
      }))
      .filter((c) => c.dist < 1) // ~1 degree ≈ ~100km
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);

    const input: DispersionInput = {
      source: [lng, lat],
      windDirection: windRes.windDirection ?? 180,
      windSpeed: windRes.windSpeed ?? 10,
      windGusts: windRes.windGusts ?? windRes.windSpeed ?? 15,
      eventType,
      durationMinutes: durationMinutes || 60,
      nearbyZones,
    };

    const result = calculateDispersion(input);

    return NextResponse.json({
      input: {
        source,
        eventType,
        durationMinutes: input.durationMinutes,
        windSpeed: input.windSpeed,
        windDirection: input.windDirection,
      },
      result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Simulate API error:", error);
    return NextResponse.json(
      { error: "No se pudo ejecutar la simulacion" },
      { status: 502 },
    );
  }
}
