"use client";

import { useState, useEffect } from "react";
import { FireHistoryChart } from "./fire-history-chart";

const PERIOD_OPTIONS = [
  { value: 1, label: "1 mes" },
  { value: 6, label: "6 meses" },
  { value: 12, label: "1 ano" },
  { value: 24, label: "2 anos" },
  { value: 60, label: "5 anos" },
  { value: 120, label: "10 anos" },
] as const;

export function FireHistoryDashboard() {
  const [months, setMonths] = useState(1);
  const [maxMonths, setMaxMonths] = useState(120);

  // Check how much data we actually have
  useEffect(() => {
    fetch("/api/fires/history?months=120")
      .then((r) => r.json())
      .then((data) => {
        const days = data.count || 0;
        // Estimate available months from day count
        if (days < 35) setMaxMonths(1);
        else if (days < 100) setMaxMonths(6);
        else if (days < 200) setMaxMonths(6);
        else if (days < 400) setMaxMonths(12);
        else if (days < 800) setMaxMonths(24);
        else if (days < 1800) setMaxMonths(60);
        else setMaxMonths(120);
      })
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Period selector */}
      <div className="flex items-center gap-3 mb-8">
        <span className="font-mono text-xs text-muted">Periodo:</span>
        <div className="flex gap-1 flex-wrap">
          {PERIOD_OPTIONS.map((opt) => {
            const disabled = opt.value > maxMonths && opt.value > 1;
            return (
              <button
                key={opt.value}
                onClick={() => !disabled && setMonths(opt.value)}
                disabled={disabled}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
                  months === opt.value
                    ? "bg-accent text-white"
                    : disabled
                      ? "bg-surface-2 text-muted/30 border border-border/50 cursor-not-allowed"
                      : "bg-surface-2 text-muted hover:text-foreground/80 border border-border"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <FireHistoryChart months={months} />
    </div>
  );
}
