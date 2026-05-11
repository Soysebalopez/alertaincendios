import { Suspense } from "react";
import { MetricCard } from "./_components/metric-card";
import { LineChartCard, StackedBarCard } from "./_components/chart-card";
import {
  getSubscriberCount,
  getSubscribersGrowth,
  getAlertsByDay,
  getGoesQuality,
  getTopProvinces,
  getBotCommands,
} from "./_lib/metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const [
    subscribers,
    growth30d,
    alerts7d,
    goesQuality,
    topProvinces,
    botCommands,
  ] = await Promise.all([
    getSubscriberCount(),
    getSubscribersGrowth(30),
    getAlertsByDay(7),
    getGoesQuality(),
    getTopProvinces(),
    getBotCommands(7),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
          Overview
        </h1>
        <p className="text-muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Métricas en vivo · service role
        </p>
      </header>

      {/* Tier 1 — KPIs */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard
          label="Suscriptores total"
          value={subscribers.total.toLocaleString("es-AR")}
          sub={`+${subscribers.last7d} en 7d`}
          tone={subscribers.last7d > 0 ? "accent" : undefined}
        />
        <MetricCard
          label="Alertas (7d)"
          value={alerts7d.reduce(
            (a, d) => a + d.firms + d.goes_preliminary + d.goes_confirmed + d.lightning,
            0
          )}
          sub="FIRMS + GOES + rayos"
        />
        <MetricCard
          label="GOES preliminaries (7d)"
          value={goesQuality.total7d}
          sub={`${goesQuality.high_confidence} high-conf · ${goesQuality.persistent} persistentes`}
        />
        <MetricCard
          label="Confirmation rate"
          value={goesQuality.confirmation_rate}
          sub="preliminary → confirmed"
          tone={goesQuality.confirmation_rate === "—" ? undefined : "good"}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <LineChartCard
          title="Crecimiento de suscriptores (30d)"
          data={growth30d.map((p) => ({ date: p.date, suscriptores: p.value }))}
          series={[{ key: "suscriptores", label: "Suscriptores", color: "#e8622c" }]}
        />
        <StackedBarCard
          title="Alertas enviadas por día (7d)"
          data={alerts7d.map((d) => ({
            date: d.date,
            firms: d.firms,
            preliminary: d.goes_preliminary,
            confirmed: d.goes_confirmed,
            dismissed: d.goes_dismissed,
            rayos: d.lightning,
          }))}
          series={[
            { key: "firms", label: "FIRMS", color: "#e8622c" },
            { key: "preliminary", label: "GOES preliminar", color: "#fbbf24" },
            { key: "confirmed", label: "Confirmadas", color: "#4ade80" },
            { key: "dismissed", label: "Falsa alarma", color: "#8a8a7e" },
            { key: "rayos", label: "Tormenta seca", color: "#a855f7" },
          ]}
        />
      </div>

      {/* Tier 2 — Geographic + Engagement */}
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Panel title="Top provincias por suscriptores" subtitle={`${topProvinces.length} provincias`}>
          {topProvinces.length === 0 ? (
            <EmptyHint>Sin suscriptores todavía</EmptyHint>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {topProvinces.map((p) => (
                  <tr key={p.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 6px" }}>{p.name}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {p.subs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Comandos del bot (7d)" subtitle="por comando">
          {botCommands.length === 0 ? (
            <EmptyHint>
              El log de comandos arranca con este deploy. Volvé en unos días.
            </EmptyHint>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {botCommands.map((c) => (
                  <tr key={c.command} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 6px", fontFamily: "var(--font-mono)" }}>{c.command}</td>
                    <td style={{ padding: "10px 6px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {c.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: 20,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle ? (
          <div className="font-mono text-[10px] text-muted tracking-wider uppercase">{subtitle}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "24px 16px",
        textAlign: "center",
        color: "var(--muted)",
        fontSize: 13,
        fontStyle: "italic",
      }}
    >
      {children}
    </div>
  );
}
