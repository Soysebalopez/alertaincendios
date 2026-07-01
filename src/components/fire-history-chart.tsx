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
  // When the parent already has the data for `months`, it can pass it down to
  // avoid a redundant fetch to the same endpoint. If omitted, the chart
  // self-fetches (kept for standalone use).
  data?: HistoryPoint[];
  loading?: boolean;
}

const FireHistoryChart = React.memo(function FireHistoryChart({
  months,
  data: dataProp,
  loading: loadingProp,
}: FireHistoryChartProps) {
  const controlled = dataProp !== undefined;
  const [fetchedData, setFetchedData] = useState<HistoryPoint[]>([]);
  const [fetchedLoading, setFetchedLoading] = useState(true);

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    const id = setTimeout(() => !cancelled && setFetchedLoading(true), 0);
    fetch(`/api/fires/history?months=${months}`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        setFetchedData(res.data || []);
        setFetchedLoading(false);
      })
      .catch(() => {
        if (!cancelled) setFetchedLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [months, controlled]);

  const data = controlled ? dataProp : fetchedData;
  const loading = controlled ? loadingProp ?? false : fetchedLoading;

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
                <stop offset="5%" stopColor="#d2541d" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#d2541d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2ddd0"
              strokeOpacity={0.9}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#76705f" }}
              tickFormatter={(d: string) => {
                const parts = d.split("-");
                return `${parts[2]}/${parts[1]}`;
              }}
              axisLine={{ stroke: "#e2ddd0" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#76705f" }}
              axisLine={false}
              tickLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2ddd0",
                borderRadius: "8px",
                fontSize: "11px",
                padding: "8px 12px",
                color: "#1b1a15",
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
              stroke="#d2541d"
              strokeWidth={2}
              fill="url(#fire-gradient)"
              dot={false}
              activeDot={{
                r: 3,
                stroke: "#d2541d",
                strokeWidth: 2,
                fill: "#ffffff",
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
