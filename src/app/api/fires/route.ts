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
    return NextResponse.json({
      source: "nasa-firms",
      updated: new Date().toISOString(),
      fires: [],
      count: 0,
      note: "Error al consultar NASA FIRMS",
    });
  }
}
