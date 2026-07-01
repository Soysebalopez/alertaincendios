import { NextResponse } from "next/server";
import { fetchFires } from "@/lib/firms";

/**
 * GET /api/fires
 *
 * Returns active fire hotspots across Argentina from NASA FIRMS.
 */
export async function GET() {
  try {
    const fires = await fetchFires();
    const wildCount = fires.filter((f) => (f.type ?? 0) === 0 || f.type === 1).length;
    const industrialCount = fires.length - wildCount;

    return NextResponse.json({
      source: "nasa-firms",
      updated: new Date().toISOString(),
      fires,
      count: fires.length,
      wildCount,
      industrialCount,
    });
  } catch (error) {
    console.error("Fires API error:", error);
    // M4 — honest status code on upstream failure so monitoring/health (and any
    // status-aware client) can tell "no fires" apart from "FIRMS failed". Body
    // keeps the same shape (fires:[]) so existing clients that only read JSON
    // still degrade gracefully instead of crashing.
    return NextResponse.json(
      {
        source: "nasa-firms",
        updated: new Date().toISOString(),
        fires: [],
        count: 0,
        error: "Error al consultar NASA FIRMS",
      },
      { status: 502 },
    );
  }
}
