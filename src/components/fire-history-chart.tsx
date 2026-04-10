"use client";

import React, { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface HistoryPoint {
  date: string;
  count: number;
  avg_frp: number | null;
  high_conf: number;
}

interface FireHistoryChartProps {
  months: number;
}

const FireHistoryChart = React.memo(function FireHistoryChart({
  months,
}: FireHistoryChartProps) {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/fires/history?months=${months}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [months]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-6">
        <div className="h-3 w-32 rounded bg-border animate-pulse mb-6" />
        <div className="h-64 rounded bg-border/50 animate-pulse" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-6">
        <p className="text-sm text-muted text-center py-16">
          Sin datos historicos disponibles para este periodo.
          <br />
          <span className="text-xs">
            Los datos se acumulan automaticamente cada dia.
          </span>
        </p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count));
  const avgCount = Math.round(
    data.reduce((s, d) => s + d.count, 0) / data.length,
  );
  const totalHighConf = data.reduce((s, d) => s + d.high_conf, 0);
  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;

  // Check if we have less data than requested
  const expectedDays = months * 30;
  const coverageShort = data.length < expectedDays * 0.5;

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-6">
      {/* Coverage warning */}
      {coverageShort && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
          <p className="text-xs text-accent">
            Datos disponibles: {firstDate} al {lastDate} ({data.length} dias).
            El historial se acumula automaticamente — datos mas antiguos estaran
            disponibles con el tiempo.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-6 mb-6">
        <Stat label="Promedio diario" value={String(avgCount)} />
        <Stat label="Maximo" value={String(maxCount)} />
        <Stat label="Alta confianza" value={String(totalHighConf)} />
        <Stat label="Dias con datos" value={String(data.length)} />
        <Stat label="Desde" value={firstDate?.slice(5) || "—"} />
        <Stat label="Hasta" value={lastDate?.slice(5) || "—"} />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fire-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e8622c" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#e8622c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#252520"
            strokeOpacity={0.8}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#6b6b60" }}
            tickFormatter={(d: string) => {
              const parts = d.split("-");
              return `${parts[2]}/${parts[1]}`;
            }}
            axisLine={{ stroke: "#252520" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b6b60" }}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a17",
              border: "1px solid #252520",
              borderRadius: "8px",
              fontSize: "11px",
              padding: "8px 12px",
              color: "#d4d4cc",
            }}
            formatter={(value) => [
              `${value} focos`,
              "Detecciones",
            ]}
            labelFormatter={(d) => {
              const date = new Date(String(d) + "T12:00:00");
              return date.toLocaleDateString("es-AR", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              });
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#e8622c"
            strokeWidth={2}
            fill="url(#fire-gradient)"
            dot={false}
            activeDot={{
              r: 3,
              stroke: "#e8622c",
              strokeWidth: 2,
              fill: "#1a1a17",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] text-muted/60 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="font-mono text-sm text-foreground/80">{value}</p>
    </div>
  );
}

export { FireHistoryChart };
