"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

type SeriesPoint = { date: string; [k: string]: number | string };

const AXIS_COLOR = "#8a8a7e";
const GRID_COLOR = "rgba(232,98,44,0.08)";

export function LineChartCard({
  title,
  data,
  series,
}: {
  title: string;
  data: SeriesPoint[];
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <ChartShell title={title} subtitle={`${data.length} puntos`}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS_COLOR }} stroke={AXIS_COLOR} />
        <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} stroke={AXIS_COLOR} />
        <Tooltip
          contentStyle={{
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ChartShell>
  );
}

export function StackedBarCard({
  title,
  data,
  series,
}: {
  title: string;
  data: SeriesPoint[];
  series: { key: string; label: string; color: string }[];
}) {
  return (
    <ChartShell title={title} subtitle={`${data.length} días`}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: AXIS_COLOR }} stroke={AXIS_COLOR} />
        <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} stroke={AXIS_COLOR} />
        <Tooltip
          contentStyle={{
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
        ))}
      </BarChart>
    </ChartShell>
  );
}

function ChartShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactElement;
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
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {subtitle ? (
          <div className="font-mono text-[10px] text-muted tracking-wider">{subtitle}</div>
        ) : null}
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
