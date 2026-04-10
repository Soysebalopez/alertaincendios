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
  value: number;
}

interface PollutantChartProps {
  pollutant: string;
  label: string;
  color: string;
  lat: number;
  lng: number;
  days?: number;
}

const PollutantChart = React.memo(function PollutantChart({
  pollutant,
  label,
  color,
  lat,
  lng,
  days = 7,
}: PollutantChartProps) {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(
      `/api/history?lat=${lat}&lng=${lng}&pollutant=${pollutant}&days=${days}`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (res.history) setData(res.history);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pollutant, lat, lng, days]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-5">
        <div className="h-3 w-24 rounded bg-border animate-pulse mb-4" />
        <div className="h-36 rounded bg-border/30 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-xs font-semibold text-foreground/90">{label}</h3>
        </div>
        <span className="text-[10px] font-mono text-muted">ug/m3</span>
      </div>

      {data.length === 0 ? (
        <p className="text-xs text-muted text-center py-6">
          Sin datos disponibles
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id={`grad-${pollutant}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
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
                padding: "6px 10px",
                color: "#d4d4cc",
              }}
              formatter={(value) => [`${value} ug/m3`, label]}
              labelFormatter={(d) => {
                const date = new Date(String(d) + "T12:00:00");
                return date.toLocaleDateString("es-AR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${pollutant})`}
              dot={false}
              activeDot={{
                r: 3,
                stroke: color,
                strokeWidth: 2,
                fill: "#1a1a17",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
});

export { PollutantChart };
