"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

const AXIS = "#8a8a7e";
const GRID = "rgba(232,98,44,0.08)";
const TOOLTIP_STYLE = {
  background: "var(--background)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

// ─── Cascade / funnel chart (interactivo, click cambia el día visible) ──

type FunnelStage = { key: string; label: string; color: string };

const FUNNEL_STAGES: FunnelStage[] = [
  { key: "fire_pixels_global", label: "Píxeles globales", color: "#8a8a7e" },
  { key: "after_mask", label: "Tras máscara ARG", color: "#fbbf24" },
  { key: "after_polygon", label: "Tras polígono", color: "#f59e0b" },
  { key: "after_urban", label: "Tras urbano", color: "#ea580c" },
  { key: "after_flaring", label: "Tras flaring", color: "#dc2626" },
  { key: "after_dedup", label: "Tras dedup", color: "#e8622c" },
  { key: "inserted", label: "Insertados", color: "#4ade80" },
];

type FunnelDay = {
  date: string;
  fire_pixels_global: number;
  after_mask: number;
  after_polygon: number;
  after_urban: number;
  after_flaring: number;
  after_dedup: number;
  inserted: number;
};

export function FunnelCascade({ days }: { days: FunnelDay[] }) {
  const [selectedIdx, setSelectedIdx] = useState(days.length - 1);
  const selected = days[selectedIdx] ?? days[0];

  const cascade = useMemo(() => {
    if (!selected) return [];
    const row = selected as unknown as Record<string, number>;
    return FUNNEL_STAGES.map((s, i) => {
      const v = row[s.key] ?? 0;
      const prev = i === 0 ? v : (row[FUNNEL_STAGES[i - 1].key] ?? 0);
      const drop = i === 0 ? 0 : prev - v;
      const pct = prev > 0 ? Math.round((v / prev) * 100) : 100;
      return {
        label: s.label,
        value: v,
        drop,
        retentionPct: pct,
        color: s.color,
      };
    });
  }, [selected]);


  if (!selected) {
    return <Empty>Sin datos de scans GOES en el período.</Empty>;
  }

  const totalInput = cascade[0]?.value ?? 0;
  const totalOutput = cascade[cascade.length - 1]?.value ?? 0;
  const overallPct = totalInput > 0 ? Math.round((totalOutput / totalInput) * 100) : 0;

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div className="font-mono text-[11px] text-muted uppercase tracking-wider">
          Día seleccionado: <span style={{ color: "var(--foreground)" }}>{selected.date}</span>
        </div>
        <div className="font-mono text-[11px] text-muted uppercase tracking-wider">
          Retención global:{" "}
          <span style={{ color: "var(--accent)" }}>
            {overallPct}% ({totalOutput}/{totalInput})
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={days.length - 1}
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          style={{ flex: 1, minWidth: 140, accentColor: "var(--accent)" }}
        />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {cascade.map((s, i) => {
          const widthPct = totalInput > 0 ? (s.value / totalInput) * 100 : 0;
          return (
            <div key={s.label} style={{ display: "grid", gridTemplateColumns: "180px 1fr 90px", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "var(--foreground)" }}>{s.label}</div>
              <div
                style={{
                  height: 24,
                  background: "color-mix(in oklab, var(--foreground) 4%, transparent)",
                  borderRadius: 4,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: s.color,
                    transition: "width 220ms ease",
                  }}
                />
                {i > 0 && s.drop > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      right: 6,
                      top: 4,
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--muted)",
                    }}
                  >
                    −{s.drop.toLocaleString("es-AR")}
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  textAlign: "right",
                  color: "var(--foreground)",
                }}
              >
                {s.value.toLocaleString("es-AR")}{" "}
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  ({s.retentionPct}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Area chart con toggle entre stages ─────────────────────────────────

export function FunnelTrendArea({ days }: { days: FunnelDay[] }) {
  const [stage, setStage] = useState<keyof FunnelDay>("inserted");
  const stages: { key: keyof FunnelDay; label: string }[] = [
    { key: "fire_pixels_global", label: "Píxeles" },
    { key: "after_mask", label: "Tras máscara" },
    { key: "after_polygon", label: "Tras polígono" },
    { key: "after_urban", label: "Tras urbano" },
    { key: "after_flaring", label: "Tras flaring" },
    { key: "after_dedup", label: "Tras dedup" },
    { key: "inserted", label: "Insertados" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {stages.map((s) => (
          <button
            key={s.key}
            onClick={() => setStage(s.key)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 11,
              border: "1px solid var(--border)",
              background: stage === s.key ? "var(--accent)" : "transparent",
              color: stage === s.key ? "#fff" : "var(--foreground)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={days} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="funnelArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e8622c" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#e8622c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS }} stroke={AXIS} />
            <YAxis tick={{ fontSize: 11, fill: AXIS }} stroke={AXIS} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey={stage as string}
              stroke="#e8622c"
              strokeWidth={2}
              fill="url(#funnelArea)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Confirmation vs dismissal trend (line) ──────────────────────────────

export function ConfirmationTrend({
  data,
}: {
  data: { month: string; conf_rate: number; dism_rate: number; alerted: number }[];
}) {
  if (data.length === 0) {
    return <Empty>Sin alertas GOES en los últimos 6 meses.</Empty>;
  }
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} stroke={AXIS} />
          <YAxis
            tick={{ fontSize: 11, fill: AXIS }}
            stroke={AXIS}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="conf_rate"
            name="Confirmadas"
            stroke="#4ade80"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="dism_rate"
            name="Descartadas"
            stroke="#8a8a7e"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Donut chart (civilian vs fireman, lightning, etc.) ─────────────────

export function DonutChart({
  data,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number; color: string }[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) {
    return <Empty>Sin datos</Empty>;
  }
  return (
    <div style={{ position: "relative", width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => {
              const n = typeof v === "number" ? v : Number(v);
              return [`${n} (${Math.round((n / total) * 100)}%)`, name as string];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: 0,
            right: 0,
            transform: "translateY(-50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {centerValue ? (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--foreground)",
              }}
            >
              {centerValue}
            </div>
          ) : null}
          {centerLabel ? (
            <div className="font-mono text-[9px] text-muted uppercase tracking-wider">
              {centerLabel}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Bar chart genérico horizontal ──────────────────────────────────────

export function HorizontalBars({
  data,
  color = "#e8622c",
  height = 220,
}: {
  data: { name: string; value: number }[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <Empty>Sin datos</Empty>;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} stroke={AXIS} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fontSize: 11, fill: AXIS }}
            stroke={AXIS}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(232,98,44,0.05)" }} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "32px 16px",
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
