import { NextRequest, NextResponse } from "next/server";
import { degreesToCardinal, cardinalToSpanish } from "@/lib/wind";

/**
 * GET /api/wind?lat=-34.6&lng=-58.38
 *
 * Returns current wind data for any location using Open-Meteo.
 */

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lng = request.nextUrl.searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 },
    );
  }

  try {
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      current:
        "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",
      timezone: "America/Argentina/Buenos_Aires",
    });

    const res = await fetch(`${OPEN_METEO_BASE}?${params}`, {
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
    });
  } catch (error) {
    console.error("Wind API error:", error);
    return NextResponse.json(
      { error: "No se pudieron obtener datos de viento" },
      { status: 502 },
    );
  }
}
