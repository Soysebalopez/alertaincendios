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
    let cancelled = false;
    const id = setTimeout(() => !cancelled && setLoading(true), 0);
    fetch(`/api/fires/history?months=${months}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setData(res.data || []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [months]);

  if (loading) {
    return (
      <div className="h-[320px] rounded bg-border/30 animate-pulse" />
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="text-center"
        style={{ padding: "72px 16px", color: "var(--muted)" }}
      >
        <p className="text-sm">Sin datos históricos disponibles para este período.</p>
        <p className="text-xs mt-1 opacity-70">
          Los datos se acumulan automáticamente cada día.
        </p>
      </div>
    );
  }

  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;

  return (
    <div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="fire-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e8622c" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#e8622c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#252520"
              strokeOpacity={0.6}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#8a8a7e" }}
              tickFormatter={(d: string) => {
                const parts = d.split("-");
                return `${parts[2]}/${parts[1]}`;
              }}
              axisLine={{ stroke: "#252520" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#8a8a7e" }}
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
              formatter={(value) => [`${value} focos`, "Detecciones"]}
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
      <div className="flex justify-between mt-2.5 font-mono text-[10px] text-muted">
        <span>{firstDate?.slice(5) ?? ""}</span>
        <span>{lastDate?.slice(5) ?? "hoy"}</span>
      </div>
    </div>
  );
});

export { FireHistoryChart };
