import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/fires/history?months=6
 *
 * Returns daily fire counts from fires_daily_history.
 * Supported months: 1, 6, 12, 24, 60, 120
 */

const VALID_MONTHS = [1, 6, 12, 24, 60, 120];

export async function GET(request: NextRequest) {
  const months = Number(request.nextUrl.searchParams.get("months") || "6");
  const safemonths = VALID_MONTHS.includes(months) ? months : 6;

  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - safemonths);
    const startStr = startDate.toISOString().split("T")[0];

    const { data, error } = await getSupabase()
      .from("fires_daily_history")
      .select("date, count, avg_frp, high_conf")
      .gte("date", startStr)
      .order("date", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      period: `${safemonths}m`,
      source: "fires_daily_history",
      data: data || [],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error("Fire history API error:", error);
    return NextResponse.json(
      { period: `${safemonths}m`, data: [], count: 0, error: "No se pudo obtener el historial" },
      { status: 502 },
    );
  }
}
