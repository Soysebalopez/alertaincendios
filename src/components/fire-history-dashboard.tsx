"use client";

import { useEffect, useState } from "react";
import { FireHistoryChart } from "./fire-history-chart";

interface HistoryPoint {
  date: string;
  count: number;
  avg_frp: number | null;
  high_conf: number;
}

const PERIOD_OPTIONS = [
  { value: 1, label: "1 mes", key: "1m" },
  { value: 6, label: "6 meses", key: "6m" },
  { value: 12, label: "1 año", key: "1y" },
  { value: 24, label: "2 años", key: "2y" },
  { value: 60, label: "5 años", key: "5y" },
] as const;

export function FireHistoryDashboard() {
  const [months, setMonths] = useState(1);
  const [maxMonths, setMaxMonths] = useState(60);
  const [data, setData] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetch("/api/fires/history?months=120")
      .then((r) => r.json())
      .then((res) => {
        const days = res.count || 0;
        if (days < 35) setMaxMonths(1);
        else if (days < 200) setMaxMonths(6);
        else if (days < 400) setMaxMonths(12);
        else if (days < 800) setMaxMonths(24);
        else setMaxMonths(60);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/fires/history?months=${months}`)
      .then((r) => r.json())
      .then((res) => {
        setData(res.data || []);
      })
      .catch(() => {});
  }, [months]);

  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = data.length > 0 ? Math.round(total / data.length) : 0;
  const peak = data.length > 0 ? Math.max(...data.map((d) => d.count)) : 0;

  const KPIS = [
    {
      k: "Total focos",
      v: total > 0 ? total.toLocaleString("es-AR") : "—",
      sub:
        months === 1
          ? "últimos 30 días"
          : months === 6
            ? "últimos 6 meses"
            : months === 12
              ? "último año"
              : `últimos ${months} meses`,
    },
    {
      k: "Promedio diario",
      v: avg > 0 ? avg.toLocaleString("es-AR") : "—",
      sub: "focos / día",
    },
    {
      k: "Pico máximo",
      v: peak > 0 ? peak.toLocaleString("es-AR") : "—",
      sub: "en un día",
    },
    {
      k: "Días monitoreados",
      v: data.length > 0 ? String(data.length) : "—",
      sub: "cobertura continua",
    },
  ];

  return (
    <div>
      {/* KPIs */}
      <div
        className="grid mb-6"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {KPIS.map((m) => (
          <div
            key={m.k}
            style={{
              padding: 20,
              borderRadius: 12,
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-2">
              {m.k}
            </div>
            <div
              className="text-foreground"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {m.v}
            </div>
            <div className="font-mono text-[10px] text-muted mt-1.5">
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div
        style={{
          padding: 24,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
            Focos detectados por día
          </div>
          <div
            className="flex gap-1 flex-wrap"
            style={{
              padding: 4,
              borderRadius: 10,
              background: "var(--background)",
              border: "1px solid var(--border)",
            }}
          >
            {PERIOD_OPTIONS.map((opt) => {
              const disabled = opt.value > maxMonths && opt.value > 1;
              const active = months === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => !disabled && setMonths(opt.value)}
                  disabled={disabled}
                  className="transition-colors"
                  style={{
                    padding: "6px 14px",
                    borderRadius: 7,
                    border: "none",
                    background: active ? "var(--accent)" : "transparent",
                    color: active
                      ? "#fff"
                      : disabled
                        ? "color-mix(in oklab, var(--muted) 30%, transparent)"
                        : "var(--muted)",
                    cursor: disabled ? "not-allowed" : "pointer",
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <FireHistoryChart months={months} />
      </div>

      <p
        className="font-mono text-[10px] text-muted text-center mt-6"
        style={{ letterSpacing: "0.06em" }}
      >
        Fuente: NASA FIRMS VIIRS · Agregación diaria vía Supabase pg_cron ·
        Backfill manual para fechas anteriores
      </p>
    </div>
  );
}
