"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AIR_LEVEL_COLORS,
  AIR_LEVEL_LABELS,
  type AirLevel,
} from "@/lib/air-quality";

interface PollutantData {
  value: number;
  unit: string;
  level: AirLevel;
  levelLabel: string;
}

interface CityAirData {
  pollutants: Record<string, PollutantData>;
  worstLevel: AirLevel;
}

interface WindInfo {
  windSpeed: number;
  windDirectionLabelEs: string;
  temperature: number;
}

type Filter = "all" | "good" | "moderate" | "bad";

export function CityCard({
  name,
  lat,
  lng,
  href,
  filter = "all",
}: {
  name: string;
  lat: number;
  lng: number;
  href?: string;
  filter?: Filter;
}) {
  const [air, setAir] = useState<CityAirData | null>(null);
  const [wind, setWind] = useState<WindInfo | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/air-quality?lat=${lat}&lng=${lng}`).then((r) => r.json()),
      fetch(`/api/wind?lat=${lat}&lng=${lng}`).then((r) => r.json()),
    ])
      .then(([airRes, windRes]) => {
        if (airRes.pollutants) {
          setAir({
            pollutants: airRes.pollutants,
            worstLevel: airRes.worstLevel,
          });
        }
        if (windRes.windSpeed != null) {
          setWind({
            windSpeed: windRes.windSpeed,
            windDirectionLabelEs: windRes.windDirectionLabelEs,
            temperature: windRes.temperature,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(
      `/api/summary?lat=${lat}&lng=${lng}&city=${encodeURIComponent(name)}`,
    )
      .then((r) => r.json())
      .then((res) => {
        if (res.summary) setSummary(res.summary);
      })
      .catch(() => {});
  }, [lat, lng, name]);

  if (loading) {
    return (
      <div
        style={{
          padding: 22,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="h-4 w-28 rounded bg-border animate-pulse mb-3" />
        <div className="h-3 w-40 rounded bg-border/60 animate-pulse mb-5" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-3 rounded bg-border/40 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!air) {
    return (
      <div
        style={{
          padding: 22,
          borderRadius: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="font-semibold text-[15px] mb-1">{name}</div>
        <div className="text-xs text-muted">Datos no disponibles</div>
      </div>
    );
  }

  // Apply filter: "good" | "moderate" | "bad" | "all"
  if (filter !== "all") {
    const worst = air.worstLevel;
    // "bad" filter includes dangerous too
    if (filter === "bad" && !(worst === "bad" || worst === "dangerous"))
      return null;
    if (filter !== "bad" && worst !== filter) return null;
  }

  const color = AIR_LEVEL_COLORS[air.worstLevel];
  const label = AIR_LEVEL_LABELS[air.worstLevel];

  const pm25 = air.pollutants.PM25;
  const no2 = air.pollutants.NO2;
  const o3 = air.pollutants.O3;

  const content = (
    <>
      {/* Top accent gradient */}
      <div
        className="absolute left-0 right-0 top-0"
        style={{
          height: 2,
          background: `linear-gradient(90deg, ${color}, ${color}00)`,
        }}
      />
      <div className="flex justify-between items-start mb-3.5">
        <div>
          <div className="font-semibold text-[17px] text-foreground">
            {name}
          </div>
          <div className="font-mono text-[10px] text-muted mt-1 tracking-[0.08em] uppercase">
            {wind
              ? `${wind.windSpeed} km/h ${wind.windDirectionLabelEs} · ${wind.temperature}°C`
              : "cargando…"}
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <span
            className="rounded-full"
            style={{
              width: 8,
              height: 8,
              background: color,
              boxShadow: `0 0 8px ${color}`,
            }}
          />
          <span
            className="font-mono text-[10px] font-semibold uppercase"
            style={{ color, letterSpacing: "0.08em" }}
          >
            {label}
          </span>
        </div>
      </div>

      <div
        className="grid py-3 border-y border-border"
        style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}
      >
        {[
          ["PM2.5", pm25?.value],
          ["NO₂", no2?.value],
          ["O₃", o3?.value],
        ].map(([k, v]) => (
          <div key={k as string}>
            <div className="font-mono text-[9px] text-muted uppercase tracking-[0.1em]">
              {k}
            </div>
            <div className="font-mono text-[16px] text-foreground font-medium mt-0.5">
              {v != null ? (v as number).toFixed(0) : "—"}
              <span className="text-[10px] text-muted ml-0.5">μg</span>
            </div>
          </div>
        ))}
      </div>

      <p
        className="text-muted mt-3 mb-0"
        style={{ fontSize: 12, lineHeight: 1.55 }}
      >
        {summary ? (
          <>
            <span
              className="font-mono text-[9px] text-accent uppercase mr-1.5"
              style={{ letterSpacing: "0.12em" }}
            >
              IA
            </span>
            {summary}
          </>
        ) : (
          <span className="inline-block align-middle space-y-1.5 w-full">
            <span className="block h-2.5 w-full rounded bg-border/40 animate-pulse" />
            <span className="block h-2.5 w-3/4 rounded bg-border/40 animate-pulse mt-1" />
          </span>
        )}
      </p>
    </>
  );

  const cardStyle = {
    padding: 22,
    borderRadius: 14,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    position: "relative" as const,
    overflow: "hidden" as const,
    textAlign: "left" as const,
    display: "block",
    transition: "border-color 0.2s, transform 0.2s",
  };

  return href ? (
    <Link href={href} style={cardStyle} className="group">
      {content}
    </Link>
  ) : (
    <div style={cardStyle}>{content}</div>
  );
}
