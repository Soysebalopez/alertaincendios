import { NextRequest, NextResponse } from "next/server";
import {
  getAirLevel,
  AQI_THRESHOLDS,
  AIR_LEVEL_LABELS,
  POLLUTANT_VARS,
  type AirLevel,
} from "@/lib/air-quality";

/**
 * GET /api/air-quality?lat=-34.6&lng=-58.38
 *
 * Returns current air quality for any lat/lng using Open-Meteo CAMS data.
 */

const AIR_QUALITY_BASE =
  "https://air-quality-api.open-meteo.com/v1/air-quality";

function round(n: number): number {
  if (n == null || isNaN(n)) return 0;
  return Math.round(n * 10) / 10;
}

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
    const vars = Object.values(POLLUTANT_VARS).join(",");
    const params = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      current: vars,
      timezone: "America/Argentina/Buenos_Aires",
    });

    const res = await fetch(`${AIR_QUALITY_BASE}?${params}`, {
      next: { revalidate: 1800 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Open-Meteo API error" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const c = data.current;

    const pollutants: Record<
      string,
      { value: number; unit: string; level: AirLevel; levelLabel: string }
    > = {};

    let worstLevel: AirLevel = "good";
    const levelPriority: AirLevel[] = [
      "good",
      "moderate",
      "bad",
      "dangerous",
    ];

    for (const [key, varName] of Object.entries(POLLUTANT_VARS)) {
      const value = round(c[varName] ?? 0);
      const thresholdKey = key as keyof typeof AQI_THRESHOLDS;
      const level =
        thresholdKey in AQI_THRESHOLDS
          ? getAirLevel(thresholdKey, value)
          : ("good" as AirLevel);

      pollutants[key] = {
        value,
        unit: "ug/m3",
        level,
        levelLabel: AIR_LEVEL_LABELS[level],
      };

      if (levelPriority.indexOf(level) > levelPriority.indexOf(worstLevel)) {
        worstLevel = level;
      }
    }

    return NextResponse.json({
      lat: Number(lat),
      lng: Number(lng),
      source: "open-meteo-cams",
      updated: new Date().toISOString(),
      pollutants,
      worstLevel,
      worstLevelLabel: AIR_LEVEL_LABELS[worstLevel],
    });
  } catch (error) {
    console.error("Air quality API error:", error);
    return NextResponse.json(
      { error: "No se pudo obtener la calidad del aire" },
      { status: 502 },
    );
  }
}
