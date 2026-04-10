"use client";

import React, { useEffect, useState } from "react";
import {
  getAirLevel,
  AIR_LEVEL_LABELS,
  AIR_LEVEL_COLORS,
  type AirLevel,
} from "@/lib/air-quality";

const LiveStatus = React.memo(function LiveStatus() {
  const [wind, setWind] = useState<{
    windSpeed: number;
    windDirectionLabelEs: string;
    temperature: number;
  } | null>(null);
  const [level, setLevel] = useState<AirLevel>("good");
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  useEffect(() => {
    // Default coords: Buenos Aires as representative
    const lat = -34.6037;
    const lng = -58.3816;

    Promise.all([
      fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/wind?lat=${lat}&lng=${lng}`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([airRes, windRes]) => {
      if (windRes?.windSpeed != null) {
        setWind({
          windSpeed: windRes.windSpeed,
          windDirectionLabelEs: windRes.windDirectionLabelEs,
          temperature: windRes.temperature,
        });
      }

      if (airRes?.pollutants) {
        const levels: AirLevel[] = [];
        const p = airRes.pollutants;
        if (p.NO2) levels.push(getAirLevel("NO2", p.NO2.value));
        if (p.SO2) levels.push(getAirLevel("SO2", p.SO2.value));
        if (p.PM25) levels.push(getAirLevel("PM25", p.PM25.value));
        if (p.O3) levels.push(getAirLevel("O3", p.O3.value));
        const priority: AirLevel[] = [
          "dangerous",
          "bad",
          "moderate",
          "good",
        ];
        setLevel(priority.find((pr) => levels.includes(pr)) || "good");
      }
    });

    // Non-blocking AI summary
    fetch(
      `/api/summary?lat=-34.6037&lng=-58.3816&city=Buenos Aires`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setAiSummary(data.summary);
      })
      .catch(() => {});
  }, []);

  const color = AIR_LEVEL_COLORS[level];
  const label = AIR_LEVEL_LABELS[level];

  return (
    <div className="rounded-xl border border-border bg-surface-2 px-5 py-4">
      <div className="flex items-center gap-4 mb-2">
        <div
          className="thermal-pulse flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20` }}
        >
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-xs font-medium tracking-wide uppercase text-muted">
              Calidad del aire
            </p>
            <span
              className="text-xs font-semibold uppercase"
              style={{ color }}
            >
              {label}
            </span>
          </div>
          {wind ? (
            <p className="text-sm text-foreground/70 leading-snug">
              {wind.windSpeed} km/h{" "}
              {wind.windDirectionLabelEs.toLowerCase()}
              {" — "}
              {wind.temperature}&deg;C
            </p>
          ) : (
            <div className="h-4 w-48 rounded bg-border/30 animate-pulse" />
          )}
        </div>
      </div>

      {aiSummary ? (
        <p className="text-xs text-muted leading-relaxed border-t border-border/50 pt-2 mt-1">
          {aiSummary}
        </p>
      ) : (
        <div className="border-t border-border/50 pt-2 mt-1 space-y-1.5">
          <div className="h-2.5 w-full rounded bg-border/30 animate-pulse" />
          <div className="h-2.5 w-3/4 rounded bg-border/30 animate-pulse" />
        </div>
      )}
    </div>
  );
});

export { LiveStatus };
