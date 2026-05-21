import { NextRequest, NextResponse } from "next/server";
import { translateToCitizen } from "@/lib/translate";
import {
  checkRateLimit,
  clientIp,
  rateLimitHeaders,
} from "@/lib/ratelimit";

/**
 * GET /api/summary?lat=-34.6&lng=-58.38&city=Buenos Aires
 *
 * Generates a citizen-friendly environmental summary using Groq AI.
 * Fetches air quality and wind data, then translates to simple Spanish.
 */

// H-10 — protege el budget Groq, que es el caller más caro. 10 req/min/IP
// es generoso para uso humano (un click cada 6s) pero corta loops de abuso.
const RATE_LIMIT_PER_MIN = 10;

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");
  const city = request.nextUrl.searchParams.get("city") || "tu ciudad";

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 },
    );
  }

  const rl = await checkRateLimit({
    key: clientIp(request),
    limit: RATE_LIMIT_PER_MIN,
    windowSec: 60,
    namespace: "summary",
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMIT_PER_MIN) },
    );
  }

  const origin = new URL(request.url).origin;
  // Header interno para que el rate-limiter de /api/wind y /api/air-quality
  // sepa que estas llamadas vienen del propio backend y no del usuario final.
  // El secret se valida en isInternalCall(); sin CRON_SECRET el bypass no
  // funciona, pero los endpoints siguen funcionando (solo cuentan los tokens
  // contra el IP del cliente original — que no sería el real pero sí del proxy).
  const internalHeaders = process.env.CRON_SECRET
    ? { "x-clara-internal": process.env.CRON_SECRET }
    : undefined;

  try {
    const [airRes, windRes] = await Promise.all([
      fetch(`${origin}/api/air-quality?lat=${lat}&lng=${lng}`, {
        headers: internalHeaders,
      }).then((r) => r.json()),
      fetch(`${origin}/api/wind?lat=${lat}&lng=${lng}`, {
        headers: internalHeaders,
      }).then((r) => r.json()),
    ]);

    const summary = await translateToCitizen({
      city,
      airQuality: airRes.pollutants || {},
      wind: {
        speed: windRes.windSpeed ?? 0,
        directionEs: windRes.windDirectionLabelEs ?? "desconocido",
        temperature: windRes.temperature ?? 0,
        humidity: windRes.humidity ?? 0,
      },
    });

    return NextResponse.json({
      summary,
      city,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Summary API error:", error);
    return NextResponse.json(
      { error: "No se pudo generar el resumen", summary: null },
      { status: 502 },
    );
  }
}
