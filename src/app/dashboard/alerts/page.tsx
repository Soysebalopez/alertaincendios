import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AlertsLogPage() {
  const db = getSupabase();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: firms }, { data: goes }, { data: lightning }] = await Promise.all([
    db
      .from("ai_alerted_fires")
      .select("fire_key, chat_id, alerted_at")
      .gte("alerted_at", since)
      .order("alerted_at", { ascending: false })
      .limit(100),
    db
      .from("goes_alerted")
      .select(
        "id, chat_id, preliminary_sent_at, confirmed_sent_at, dismissed_at, firms_fire_key, goes_preliminary(lat, lng, frp_mw, mask_label)"
      )
      .gte("preliminary_sent_at", since)
      .order("preliminary_sent_at", { ascending: false })
      .limit(100),
    db
      .from("lightning_alerted")
      .select("chat_id, alerted_at")
      .gte("alerted_at", since)
      .order("alerted_at", { ascending: false })
      .limit(100),
  ]);

  function tsLabel(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  }

  function goesStatus(r: {
    confirmed_sent_at: string | null;
    dismissed_at: string | null;
  }): { label: string; tone: string } {
    if (r.confirmed_sent_at) return { label: "Confirmada", tone: "#4ade80" };
    if (r.dismissed_at) return { label: "Descartada", tone: "#8a8a7e" };
    return { label: "Pendiente", tone: "#fbbf24" };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <header>
        <h1 style={{ fontFamily: "var(--font-sans)", fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", margin: 0 }}>
          Alertas (últimos 7 días)
        </h1>
        <p className="text-muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          Máximo 100 rows por tipo · más viejas en /historial cuando se necesiten
        </p>
      </header>

      {/* FIRMS confirmadas */}
      <Section title="🚨 FIRMS confirmadas" subtitle={`${firms?.length ?? 0} alertas`}>
        <Table headers={["Cuándo", "fire_key", "chat_id"]}>
          {(firms ?? []).map((r) => (
            <tr key={`${r.fire_key}_${r.chat_id}`}>
              <td style={td}>{tsLabel(r.alerted_at as string)}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11 }}>{r.fire_key as string}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.chat_id as number}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* GOES preliminaries */}
      <Section title="⚠️ GOES preliminaries" subtitle={`${goes?.length ?? 0} alertas`}>
        <Table headers={["Enviada", "Status", "Lat/Lng", "FRP", "chat_id"]}>
          {(goes ?? []).map((r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const gp = (r as any).goes_preliminary as { lat: number; lng: number; frp_mw: number | null; mask_label: string } | null;
            const status = goesStatus(r as never);
            return (
              <tr key={r.id as number}>
                <td style={td}>{tsLabel(r.preliminary_sent_at as string)}</td>
                <td style={td}>
                  <span style={{ color: status.tone, fontWeight: 600 }}>● {status.label}</span>
                </td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {gp ? `${gp.lat.toFixed(2)}, ${gp.lng.toFixed(2)}` : "—"}
                </td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>
                  {gp?.frp_mw != null ? `${gp.frp_mw.toFixed(1)} MW` : "—"}
                </td>
                <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.chat_id as number}</td>
              </tr>
            );
          })}
        </Table>
      </Section>

      {/* Lightning */}
      <Section title="⚡ Tormenta seca" subtitle={`${lightning?.length ?? 0} alertas`}>
        <Table headers={["Cuándo", "chat_id"]}>
          {(lightning ?? []).map((r, i) => (
            <tr key={`${r.chat_id}_${i}`}>
              <td style={td}>{tsLabel(r.alerted_at as string)}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.chat_id as number}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}

const td: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  borderBottom: "1px solid var(--border)",
};

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
    <div
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
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle ? <div className="font-mono text-[10px] text-muted">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
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
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
