"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  getAirLevel,
  AIR_LEVEL_LABELS,
  AIR_LEVEL_COLORS,
  type AirLevel,
} from "@/lib/air-quality";
import { PROVINCES } from "@/lib/argentina-cities";

interface CitySlot {
  name: string;
  provinceName: string;
  provinceId: string;
  slug: string;
  lat: number;
  lng: number;
}

interface CityMetrics {
  level: AirLevel;
  pm25: number | null;
  windSpeed: number | null;
  windDirectionLabelEs: string;
  temperature: number | null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function pickRandomCities(count: number): CitySlot[] {
  const all = PROVINCES.flatMap((p) =>
    p.cities.map((c) => ({
      name: c.name,
      provinceName: p.name,
      provinceId: p.id,
      slug: slugify(c.name),
      lat: c.lat,
      lng: c.lng,
    })),
  );
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

export const LiveCityGrid = React.memo(function LiveCityGrid({
  count = 12,
}: {
  count?: number;
}) {
  const [cities] = useState(() => pickRandomCities(count));
  const [data, setData] = useState<Map<number, CityMetrics>>(new Map());

  const fetchCity = useCallback((idx: number, c: CitySlot) => {
    Promise.all([
      fetch(`/api/air-quality?lat=${c.lat}&lng=${c.lng}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/wind?lat=${c.lat}&lng=${c.lng}`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([airRes, windRes]) => {
      let level: AirLevel = "good";
      let pm25: number | null = null;
      if (airRes?.pollutants) {
        const p = airRes.pollutants;
        const levels: AirLevel[] = [];
        if (p.NO2) levels.push(getAirLevel("NO2", p.NO2.value));
        if (p.SO2) levels.push(getAirLevel("SO2", p.SO2.value));
        if (p.PM25) {
          levels.push(getAirLevel("PM25", p.PM25.value));
          pm25 = p.PM25.value;
        }
        if (p.O3) levels.push(getAirLevel("O3", p.O3.value));
        const priority: AirLevel[] = ["dangerous", "bad", "moderate", "good"];
        level = priority.find((pr) => levels.includes(pr)) || "good";
      }
      setData((prev) => {
        const next = new Map(prev);
        next.set(idx, {
          level,
          pm25,
          windSpeed: windRes?.windSpeed ?? null,
          windDirectionLabelEs: windRes?.windDirectionLabelEs ?? "",
          temperature: windRes?.temperature ?? null,
        });
        return next;
      });
    });
  }, []);

  useEffect(() => {
    cities.forEach((c, i) => fetchCity(i, c));
  }, [cities, fetchCity]);

  return (
    <div
      className="clara-aire-grid grid"
      style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}
    >
      {cities.map((c, i) => {
        const m = data.get(i);
        const color = m ? AIR_LEVEL_COLORS[m.level] : "var(--border)";
        const label = m ? AIR_LEVEL_LABELS[m.level] : "—";
        return (
          <Link
            key={`${c.provinceId}-${c.slug}`}
            href={`/ciudad/${c.provinceId}/${c.slug}`}
            className="group relative overflow-hidden transition-all"
            style={{
              padding: 18,
              borderRadius: 12,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              textAlign: "left",
            }}
          >
            <div
              className="absolute left-0 top-0 h-full"
              style={{ width: 3, background: color, opacity: 0.8 }}
            />
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="font-semibold text-[15px] text-foreground">
                  {c.name}
                </div>
                <div className="font-mono text-[10px] text-muted mt-0.5 tracking-[0.06em] uppercase">
                  {c.provinceName}
                </div>
              </div>
              <span
                className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase"
                style={{
                  color,
                  background: m ? color + "22" : "transparent",
                  letterSpacing: "0.06em",
                }}
              >
                {label}
              </span>
            </div>
            <div
              className="grid mt-3.5 pt-3 border-t border-border"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}
            >
              <div>
                <div className="font-mono text-[9px] text-muted uppercase tracking-[0.1em]">
                  PM2.5
                </div>
                <div className="font-mono text-[15px] text-foreground font-medium mt-0.5">
                  {m?.pm25 != null ? m.pm25.toFixed(0) : "—"}{" "}
                  <span className="text-muted text-[11px]">μg/m³</span>
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] text-muted uppercase tracking-[0.1em]">
                  Viento · Temp
                </div>
                <div className="font-mono text-[12px] text-foreground mt-0.5">
                  {m?.windSpeed != null
                    ? `${m.windSpeed} km/h`
                    : "—"}
                  {m?.temperature != null ? ` · ${m.temperature}°` : ""}
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
});
