import { NextRequest, NextResponse } from "next/server";
import { translateToCitizen } from "@/lib/translate";

/**
 * GET /api/summary?lat=-34.6&lng=-58.38&city=Buenos Aires
 *
 * Generates a citizen-friendly environmental summary using Groq AI.
 * Fetches air quality and wind data, then translates to simple Spanish.
 */

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

  const origin = new URL(request.url).origin;

  try {
    const [airRes, windRes] = await Promise.all([
      fetch(`${origin}/api/air-quality?lat=${lat}&lng=${lng}`).then((r) =>
        r.json(),
      ),
      fetch(`${origin}/api/wind?lat=${lat}&lng=${lng}`).then((r) => r.json()),
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
