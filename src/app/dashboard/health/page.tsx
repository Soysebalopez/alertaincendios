import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CronRow = {
  jobname: string;
  schedule: string;
  last_run: string | null;
  last_status: string | null;
  lag_minutes: number | null;
};

type HttpRow = {
  id: number;
  status_code: number | null;
  created: string;
  content: string | null;
};

// Expected cadence in minutes per job — used to flag lag
const EXPECTED_CADENCE_MIN: Record<string, number> = {
  "fires-fetch": 15,
  "fires-process": 15,
  "fires-alerts": 15,
  "fires-daily-snapshot": 60 * 24,
  "goes-sync": 10,
  "goes-alerts": 10,
  "goes-dismissals": 60 * 24,
  "goes-prune": 60 * 24,
};

export default async function HealthPage() {
  const db = getSupabase();
  const { data: crons } = await db.rpc("clara_cron_health");
  const { data: recentHttp } = await db
    .from("_http_response" as never)
    .select("*")
    .limit(0); // we know this won't work — use net schema via RPC if needed

  const cronRows = (crons ?? []) as CronRow[];

  function statusTone(r: CronRow): { label: string; color: string } {
    if (!r.last_run) return { label: "Nunca corrió", color: "#ef4444" };
    if (r.last_status === "failed") return { label: "FAILED", color: "#ef4444" };
    const expected = EXPECTED_CADENCE_MIN[r.jobname] ?? 60;
    if ((r.lag_minutes ?? Number.POSITIVE_INFINITY) > expected * 2) {
      return { label: "Atrasado", color: "#fbbf24" };
    }
    return { label: r.last_status ?? "OK", color: "#4ade80" };
  }

  function tsLabel(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
          Pipelines & salud del sistema
        </h1>
        <p className="text-muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Estado del último ciclo de cada pg_cron job (via clara_cron_health RPC)
        </p>
      </header>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Job", "Schedule", "Última corrida", "Lag", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--muted)",
                    background: "var(--background)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cronRows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                  No hay jobs (verificá que la RPC clara_cron_health existe)
                </td>
              </tr>
            ) : (
              cronRows.map((r) => {
                const tone = statusTone(r);
                return (
                  <tr key={r.jobname} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 13 }}>{r.jobname}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                      {r.schedule}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 12 }}>{tsLabel(r.last_run)}</td>
                    <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {r.lag_minutes != null ? `${r.lag_minutes} min` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: tone.color + "22",
                          color: tone.color,
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "var(--font-mono)",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                        }}
                      >
                        ● {tone.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted" style={{ fontSize: 12 }}>
        Para inspección detallada de respuestas HTTP: SQL Editor → <code>SELECT * FROM net._http_response ORDER BY created DESC LIMIT 50;</code>
      </p>
      {/* Suppress unused var warning */}
      {recentHttp ? null : null}
    </div>
  );
}
