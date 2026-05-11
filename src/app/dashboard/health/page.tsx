import { getSupabase } from "@/lib/supabase";
import { getRecentGoesRuns, getFunnelAggregate } from "../_lib/metrics";

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
  const [{ data: crons }, recentRuns, funnel7d] = await Promise.all([
    db.rpc("clara_cron_health"),
    getRecentGoesRuns(15),
    getFunnelAggregate(7),
  ]);

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

      {/* WHI-587 follow-up — GOES filter funnel */}
      <FunnelSection
        recentRuns={recentRuns}
        funnel7d={funnel7d}
      />

      <p className="text-muted" style={{ fontSize: 12 }}>
        Para inspección detallada de respuestas HTTP: SQL Editor → <code>SELECT * FROM net._http_response ORDER BY created DESC LIMIT 50;</code>
      </p>
    </div>
  );
}

function FunnelSection({
  recentRuns,
  funnel7d,
}: {
  recentRuns: Awaited<ReturnType<typeof getRecentGoesRuns>>;
  funnel7d: Awaited<ReturnType<typeof getFunnelAggregate>>;
}) {
  const latest = recentRuns[0];

  function dropPct(from: number, to: number): string {
    if (from === 0) return "—";
    const dropped = from - to;
    return `−${Math.round((dropped / from) * 100)}%`;
  }

  function tsLabel(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  }

  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          GOES filter funnel
        </div>
        <div className="font-mono text-[10px] text-muted tracking-wider uppercase">
          últimos 7 días · {funnel7d.scans} scans
        </div>
      </div>

      {recentRuns.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          No hay corridas aún. Esperá al próximo cron tick (cada 10 min).
        </div>
      ) : (
        <>
          {/* Latest scan funnel — narrativa horizontal */}
          <div style={{ padding: "20px 18px", borderBottom: "1px solid var(--border)" }}>
            <div className="font-mono text-[10px] text-muted mb-2 tracking-wider uppercase">
              Último scan · {tsLabel(latest?.scan_start ?? null)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <FunnelStep label="Fire pixels (global)" value={latest.fire_pixels_global} />
              <Arrow drop={dropPct(latest.fire_pixels_global, latest.after_mask)} />
              <FunnelStep label="Mask high-conf" value={latest.after_mask} />
              <Arrow drop={dropPct(latest.after_mask, latest.after_polygon)} />
              <FunnelStep label="Polígono ARG" value={latest.after_polygon} />
              <Arrow drop={dropPct(latest.after_polygon, latest.after_urban)} />
              <FunnelStep label="Urban excl." value={latest.after_urban} />
              <Arrow drop={dropPct(latest.after_urban, latest.after_flaring)} />
              <FunnelStep label="Flaring excl." value={latest.after_flaring} />
              <Arrow drop={dropPct(latest.after_flaring, latest.after_dedup)} />
              <FunnelStep label="Dedup 4km" value={latest.after_dedup} tone="accent" />
            </div>
          </div>

          {/* 7d aggregate */}
          <div style={{ padding: "20px 18px", borderBottom: "1px solid var(--border)" }}>
            <div className="font-mono text-[10px] text-muted mb-2 tracking-wider uppercase">
              Agregado 7 días (suma de {funnel7d.scans} scans)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <FunnelStep label="Global" value={funnel7d.fire_pixels_global} />
              <Arrow drop={dropPct(funnel7d.fire_pixels_global, funnel7d.after_mask)} />
              <FunnelStep label="Mask" value={funnel7d.after_mask} />
              <Arrow drop={dropPct(funnel7d.after_mask, funnel7d.after_polygon)} />
              <FunnelStep label="Polígono" value={funnel7d.after_polygon} />
              <Arrow drop={dropPct(funnel7d.after_polygon, funnel7d.after_urban)} />
              <FunnelStep label="Urban" value={funnel7d.after_urban} />
              <Arrow drop={dropPct(funnel7d.after_urban, funnel7d.after_flaring)} />
              <FunnelStep label="Flaring" value={funnel7d.after_flaring} />
              <Arrow drop={dropPct(funnel7d.after_flaring, funnel7d.after_dedup)} />
              <FunnelStep label="Dedup" value={funnel7d.after_dedup} tone="accent" />
            </div>
          </div>

          {/* Recent runs table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Scan", "Global", "Mask", "Poly", "Urban", "Flaring", "Dedup", "Insertados", "Tiempo"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "right",
                        padding: "10px 12px",
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
                {recentRuns.map((r) => (
                  <tr key={r.created_at} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", textAlign: "left", fontSize: 11 }}>
                      {tsLabel(r.scan_start)}
                    </td>
                    <td style={tdNum}>{r.fire_pixels_global}</td>
                    <td style={tdNum}>{r.after_mask}</td>
                    <td style={tdNum}>{r.after_polygon}</td>
                    <td style={tdNum}>{r.after_urban}</td>
                    <td style={tdNum}>{r.after_flaring}</td>
                    <td style={tdNum}>{r.after_dedup}</td>
                    <td style={{ ...tdNum, color: r.inserted > 0 ? "var(--accent)" : undefined, fontWeight: r.inserted > 0 ? 700 : 400 }}>
                      {r.inserted}
                    </td>
                    <td style={tdNum}>{r.total_seconds != null ? `${r.total_seconds.toFixed(1)}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const tdNum: React.CSSProperties = {
  padding: "8px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  textAlign: "right",
};

function FunnelStep({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "accent";
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        background: tone === "accent" ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "var(--background)",
        border: tone === "accent" ? "1px solid color-mix(in oklab, var(--accent) 50%, transparent)" : "1px solid var(--border)",
        borderRadius: 10,
        minWidth: 100,
      }}
    >
      <div className="font-mono text-[9px] text-muted tracking-wider uppercase">{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone === "accent" ? "var(--accent)" : undefined }}>
        {value.toLocaleString("es-AR")}
      </div>
    </div>
  );
}

function Arrow({ drop }: { drop: string }) {
  return (
    <div className="font-mono text-[10px] text-muted" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 4px" }}>
      <div>→</div>
      <div style={{ fontSize: 9, color: "var(--accent)" }}>{drop}</div>
    </div>
  );
}
