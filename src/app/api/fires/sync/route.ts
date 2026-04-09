import { NextResponse } from "next/server";
import { syncFiresFromFirms } from "@/lib/firms";

/**
 * GET /api/fires/sync?secret=...
 *
 * Fetches fire data from NASA FIRMS and caches in Supabase.
 * Must be called from a residential IP (FIRMS blocks datacenters).
 *
 * Call this every 15 min from your local machine or a non-blocked server:
 *   curl "https://yoursite.vercel.app/api/fires/sync?secret=YOUR_CRON_SECRET"
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncFiresFromFirms();
    return NextResponse.json({
      synced: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Fire sync error:", error);
    return NextResponse.json(
      { error: "Sync failed" },
      { status: 500 }
    );
  }
}
