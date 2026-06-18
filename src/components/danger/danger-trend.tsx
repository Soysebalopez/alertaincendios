"use client";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import type { DangerZone } from "@/lib/fire-danger";

export function DangerTrend({ zones }: { zones: DangerZone[] }) {
  const dates = zones[0]?.forecast.map((f) => f.target_date) ?? [];
  const rows = dates.map((date, i) => {
    const row: Record<string, number | string> = { date: date.slice(5) };
    for (const z of zones) row[z.name] = z.forecast[i]?.fwi ?? 0;
    return row;
  });
  const colors = ["#d2541d", "#4d8f54", "#bd8512"];
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={3} />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip />
        {zones.map((z, i) => (
          <Line key={z.id} type="monotone" dataKey={z.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={1.5} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
