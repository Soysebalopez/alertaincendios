import { Wind } from "@phosphor-icons/react/dist/ssr";
import { airportWindSummary, type AirportWindRow } from "@/lib/bahia-panels";
import { getSupabase } from "@/lib/supabase";

async function loadAirportWind() {
  try {
    const { data, error } = await getSupabase()
      .from("wind_observations")
      .select("observed_at,wind_from_deg,wind_kmh,gust_kmh,variable")
      .eq("station", "SAZB")
      .order("observed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // A missing table (migration pending) or any database error: show nothing.
    if (error) return null;
    return airportWindSummary((data as AirportWindRow | null) ?? null, new Date());
  } catch {
    return null;
  }
}

/**
 * Wind measured at Comandante Espora airport (METAR SAZB), stored hourly by
 * /api/metar-sync (WHI-907 part 4). Renders nothing without a reading from the
 * last 3 hours.
 */
export async function BahiaAirportWind() {
  const summary = await loadAirportWind();
  if (!summary) return null;

  return (
    <div
      className="border border-border rounded-xl"
      style={{ padding: "20px 24px", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2">
        <Wind size={14} weight="duotone" />
        <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
          Viento medido · Aeropuerto Comandante Espora
        </span>
      </div>
      <p className="mt-2 m-0" style={{ fontSize: 15, fontWeight: 500 }}>
        {summary.windKmh} km/h{" "}
        {summary.fromLabel === "variable" ? "variable" : `del ${summary.fromLabel}`}
        {summary.gustKmh != null && ` · ráfagas de ${summary.gustKmh} km/h`}
      </p>
      <p className="mt-1 font-mono text-[11px] text-muted">
        Medido hace {summary.minutesAgo} min · METAR SAZB · es un solo punto, al este de la ciudad
      </p>
    </div>
  );
}
