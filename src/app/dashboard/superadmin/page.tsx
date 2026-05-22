import {
  getSubscriberBreakdown,
  getTopCuarteles,
  getInviteCodesStatus,
  getEngagement,
  getGoesFunnelTrend,
  getConfirmationTrend,
  getLatencies,
  getForestSplit,
  getAlertsPerSubscriber,
  getSystemHealth,
} from "../_lib/superadmin-metrics";
import { SUPERADMIN_CONFIG } from "../_lib/superadmin-config";
import { MetricCard } from "../_components/metric-card";
import {
  FunnelCascade,
  FunnelTrendArea,
  ConfirmationTrend,
  DonutChart,
  HorizontalBars,
} from "../_components/superadmin-charts";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Superadmin",
  robots: { index: false, follow: false },
};

export default async function SuperadminPage() {
  const [
    subs,
    cuarteles,
    codes,
    engagement,
    funnelTrend,
    confirmationTrend,
    latencies,
    forestSplit,
    alertsPerSub,
    sysHealth,
  ] = await Promise.all([
    getSubscriberBreakdown(),
    getTopCuarteles(),
    getInviteCodesStatus(),
    getEngagement(),
    getGoesFunnelTrend(14),
    getConfirmationTrend(),
    getLatencies(),
    getForestSplit(30),
    getAlertsPerSubscriber(30),
    getSystemHealth(),
  ]);

  const totalForestPct =
    forestSplit.forest + forestSplit.non_forest > 0
      ? Math.round(
          (forestSplit.forest / (forestSplit.forest + forestSplit.non_forest)) * 100
        )
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
      <header>
        <h1
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: 0,
          }}
        >
          Superadmin
        </h1>
        <p className="text-muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Métricas profundas · suscriptores, detección, alertas, sistema · service role
        </p>
      </header>

      {/* ════════════ Suscriptores ════════════ */}
      <Section title="Suscriptores" subtitle="bot Telegram · roles · cuarteles · engagement">
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
        >
          <MetricCard label="Total" value={subs.total.toLocaleString("es-AR")} sub="suscriptores activos" />
          <MetricCard
            label="Civilian"
            value={subs.civilian}
            sub={`${pct(subs.civilian, subs.total)} del total`}
          />
          <MetricCard
            label="Fireman"
            value={subs.fireman}
            sub={`${pct(subs.fireman, subs.total)} del total`}
            tone={subs.fireman > 0 ? "accent" : undefined}
          />
          <MetricCard
            label="En zona forestal (WUI 5km)"
            value={subs.in_forest_zone}
            sub={`${pct(subs.in_forest_zone, subs.in_forest_zone + subs.out_of_forest_zone)} del total`}
            tone="good"
          />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Civilian vs Fireman">
            <DonutChart
              data={[
                { name: "Civilian", value: subs.civilian, color: "#e8622c" },
                { name: "Fireman", value: subs.fireman, color: "#4ade80" },
              ]}
              centerLabel="Total"
              centerValue={subs.total.toString()}
            />
          </Panel>
          <Panel title="Lightning opt-in">
            <DonutChart
              data={[
                { name: "ON (alertas rayo)", value: subs.lightning_on, color: "#a855f7" },
                { name: "OFF", value: subs.lightning_off, color: "#8a8a7e" },
              ]}
              centerLabel="Opt-in"
              centerValue={`${pct(subs.lightning_on, subs.total)}`}
            />
          </Panel>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <MetricCard label="Activos 7d" value={engagement.active_7d} sub="con algún comando" tone="good" />
          <MetricCard
            label={`Activos ${SUPERADMIN_CONFIG.ACTIVE_COMMANDS_DAYS}d`}
            value={engagement.active_30d}
            sub={`${pct(engagement.active_30d, subs.total)} del total`}
          />
          <MetricCard
            label={`Zombies (>${SUPERADMIN_CONFIG.ZOMBIE_AFTER_DAYS}d sin actividad)`}
            value={engagement.zombies}
            sub="sin comandos recientes"
            tone={engagement.zombies > subs.total * 0.5 ? "warn" : undefined}
          />
          <MetricCard
            label="Cancelaciones 30d"
            value={engagement.cancellations_30d}
            sub="/cancelar emitidos"
            tone={engagement.cancellations_30d > 0 ? "warn" : undefined}
          />
        </div>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Top cuarteles" subtitle={`${cuarteles.length} cuarteles`}>
            {cuarteles.length === 0 ? (
              <EmptyHint>Ningún cuartel registrado todavía</EmptyHint>
            ) : (
              <HorizontalBars
                data={cuarteles.slice(0, 8).map((c) => ({ name: c.cuartel, value: c.subs }))}
                color="#4ade80"
                height={Math.max(140, cuarteles.length * 28)}
              />
            )}
          </Panel>
          <Panel
            title="Invite codes (fireman)"
            subtitle={`${codes.used_slots}/${codes.total_slots} usos`}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
              >
                <MiniStat label="Códigos" value={codes.total_codes} />
                <MiniStat label="Usados" value={codes.used_slots} />
                <MiniStat label="Agotados" value={codes.exhausted_codes} />
              </div>
              {codes.rows.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border)",
                        textAlign: "left",
                        color: "var(--muted)",
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <th style={{ padding: "8px 4px" }}>Cuartel</th>
                      <th style={{ padding: "8px 4px", textAlign: "right" }}>Uso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.rows.slice(0, 6).map((r) => (
                      <tr
                        key={r.code}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <td style={{ padding: "8px 4px" }}>{r.cuartel_name ?? "—"}</td>
                        <td
                          style={{
                            padding: "8px 4px",
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            color: r.used_count >= r.max_uses ? "var(--muted)" : "var(--foreground)",
                          }}
                        >
                          {r.used_count}/{r.max_uses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyHint>Sin códigos cargados</EmptyHint>
              )}
            </div>
          </Panel>
        </div>
      </Section>

      {/* ════════════ Detección GOES ════════════ */}
      <Section title="Detección GOES" subtitle="funnel · confirmation rate · latencias · forestal">
        <Panel
          title="Cascade del funnel — día seleccionable"
          subtitle="arrastrá el slider para inspeccionar otro día"
        >
          <FunnelCascade days={funnelTrend} />
        </Panel>

        <Panel
          title="Funnel trend (14 días)"
          subtitle="elegí qué etapa graficar"
        >
          <FunnelTrendArea days={funnelTrend} />
        </Panel>

        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel title="Tasa de confirmación vs descarte (6 meses)" subtitle="por mes">
            <ConfirmationTrend data={confirmationTrend} />
          </Panel>
          <Panel title="Focos por zona forestal (30d)" subtitle={`${forestSplit.forest + forestSplit.non_forest} focos totales`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  padding: "8px 12px",
                  background: "color-mix(in oklab, var(--accent) 8%, transparent)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}
              >
                <div>
                  🌲 Forestales:{" "}
                  <strong style={{ color: "var(--accent)" }}>
                    {forestSplit.forest} ({totalForestPct}%)
                  </strong>
                </div>
                <div style={{ color: "var(--muted)" }}>
                  Otros: {forestSplit.non_forest}
                </div>
              </div>
              <HorizontalBars
                data={forestSplit.by_zone.map((z) => ({ name: z.name, value: z.count }))}
                color="#4ade80"
                height={Math.max(160, forestSplit.by_zone.length * 28)}
              />
            </div>
          </Panel>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}
        >
          <LatencyCard
            title="Detected → Preliminary sent"
            stats={latencies.detected_to_preliminary_min}
            unit="min"
            hint="cuánto tarda el pipeline en enviar el aviso desde que la imagen entra"
          />
          <LatencyCard
            title="Preliminary → Confirmed"
            stats={latencies.preliminary_to_confirmed_min}
            unit="min"
            hint="tiempo hasta que FIRMS confirma un GOES preliminary"
          />
          <LatencyCard
            title="GOES sync (download + process)"
            stats={latencies.goes_sync_seconds}
            unit="s"
            hint="duración total del Python pipeline por scan"
          />
        </div>
      </Section>

      {/* ════════════ Alertas enviadas ════════════ */}
      <Section title="Alertas enviadas" subtitle="distribución por suscriptor · silenciosos">
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}
        >
          <MetricCard
            label="Alertas/suscriptor (30d)"
            value={alertsPerSub.avg_alerts_per_sub}
            sub="promedio"
            tone="accent"
          />
          <MetricCard
            label="Máximo alertas"
            value={alertsPerSub.max_alerts}
            sub="un solo sub"
          />
          <MetricCard
            label={`Subs silenciosos`}
            value={alertsPerSub.silent_subs}
            sub={`0 alertas en ${SUPERADMIN_CONFIG.SILENT_AFTER_DAYS}d`}
            tone={alertsPerSub.silent_subs > subs.total * 0.6 ? "warn" : undefined}
          />
        </div>

        <Panel
          title="Distribución de alertas recibidas (30d)"
          subtitle="cuántos subs en cada bucket"
        >
          <HorizontalBars
            data={alertsPerSub.distribution.map((d) => ({ name: d.bucket, value: d.subs }))}
            color="#e8622c"
            height={200}
          />
        </Panel>
      </Section>

      {/* ════════════ Sistema ════════════ */}
      <Section title="Sistema" subtitle="storage · satélites · health">
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}
        >
          <MetricCard
            label="goes_preliminary total"
            value={sysHealth.goes_preliminary_total.toLocaleString("es-AR")}
            sub={`+${sysHealth.goes_preliminary_7d} últimos 7d`}
          />
          <MetricCard
            label="TLE más viejo"
            value={sysHealth.tle_age_hours != null ? `${sysHealth.tle_age_hours}h` : "—"}
            sub={`${sysHealth.tle_count} satélites · ${sysHealth.tle_stale} stale (>7d)`}
            tone={sysHealth.tle_stale > 0 ? "warn" : "good"}
          />
        </div>
        <p className="text-muted" style={{ fontSize: 12, margin: "8px 4px 0" }}>
          ¿Cron status detallado? Ver{" "}
          <a
            href="/dashboard/health"
            style={{ color: "var(--accent)", textDecoration: "underline" }}
          >
            /dashboard/health
          </a>
          .
        </p>
      </Section>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          paddingBottom: 10,
          display: "flex",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        {subtitle ? (
          <span className="font-mono text-[10px] text-muted uppercase tracking-wider">
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </section>
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
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle ? (
          <div className="font-mono text-[10px] text-muted tracking-wider uppercase">
            {subtitle}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: 10,
        background: "color-mix(in oklab, var(--foreground) 3%, transparent)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <div className="font-mono text-[9px] text-muted uppercase tracking-wider">
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 600,
          marginTop: 2,
        }}
      >
        {value.toLocaleString("es-AR")}
      </div>
    </div>
  );
}

function LatencyCard({
  title,
  stats,
  unit,
  hint,
}: {
  title: string;
  stats: { p50: number | null; p95: number | null; n: number };
  unit: string;
  hint?: string;
}) {
  const fmt = (v: number | null) => {
    if (v == null) return "—";
    if (unit === "min" && v >= 60) return `${(v / 60).toFixed(1)}h`;
    return `${Math.round(v)}${unit}`;
  };
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <div>
          <div className="font-mono text-[9px] text-muted uppercase tracking-wider">p50</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700 }}>
            {fmt(stats.p50)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] text-muted uppercase tracking-wider">p95</div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              color: "var(--muted)",
            }}
          >
            {fmt(stats.p95)}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div className="font-mono text-[9px] text-muted uppercase tracking-wider">n</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--muted)" }}>
            {stats.n}
          </div>
        </div>
      </div>
      {hint ? (
        <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
          {hint}
        </div>
      ) : null}
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
