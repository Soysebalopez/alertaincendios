"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LevelBadge } from "./level-badge";
import {
  AIR_LEVEL_COLORS,
  POLLUTANT_LABELS,
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

const DISPLAY_ORDER = ["NO2", "SO2", "O3", "PM25", "PM10", "CO"];

export function CityCard({
  name,
  lat,
  lng,
  href,
}: {
  name: string;
  lat: number;
  lng: number;
  href?: string;
}) {
  const [data, setData] = useState<CityAirData | null>(null);
  const [wind, setWind] = useState<WindInfo | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch air quality + wind in parallel
    Promise.all([
      fetch(`/api/air-quality?lat=${lat}&lng=${lng}`).then((r) => r.json()),
      fetch(`/api/wind?lat=${lat}&lng=${lng}`).then((r) => r.json()),
    ])
      .then(([airRes, windRes]) => {
        if (airRes.pollutants) {
          setData({
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

    // Non-blocking: fetch AI summary
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
      <div className="rounded-xl border border-border bg-surface-2 p-5">
        <div className="h-4 w-24 rounded bg-border animate-pulse mb-4" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-3 rounded bg-border/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-5">
        <p className="text-sm font-semibold text-foreground/90 mb-2">{name}</p>
        <p className="text-xs text-muted">Datos no disponibles</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-5">
      {/* Header: name + level badge */}
      <div className="flex items-center justify-between mb-3">
        {href ? (
          <Link href={href} className="text-sm font-semibold text-foreground/90 hover:text-accent transition-colors">
            {name} →
          </Link>
        ) : (
          <p className="text-sm font-semibold text-foreground/90">{name}</p>
        )}
        <LevelBadge level={data.worstLevel} />
      </div>

      {/* Wind + temp */}
      {wind && (
        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-border/50">
          <WindArrow direction={wind.windSpeed > 0 ? 0 : -1} />
          <p className="text-xs text-muted">
            <span className="text-foreground/70">
              {wind.windSpeed} km/h
            </span>{" "}
            {wind.windDirectionLabelEs.toLowerCase()}
            {" — "}
            <span className="text-foreground/70">{wind.temperature}°C</span>
          </p>
        </div>
      )}

      {/* Pollutants */}
      <div className="space-y-1.5">
        {DISPLAY_ORDER.map((key) => {
          const p = data.pollutants[key];
          if (!p) return null;
          const color = AIR_LEVEL_COLORS[p.level];
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-xs text-muted">
                  {POLLUTANT_LABELS[key] || key}
                </span>
              </div>
              <span className="font-mono text-xs text-foreground/70">
                {p.value}{" "}
                <span className="text-muted">{p.unit}</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* AI citizen summary */}
      {summary ? (
        <p className="text-xs text-muted leading-relaxed border-t border-border/50 pt-3 mt-3">
          {summary}
        </p>
      ) : (
        <div className="border-t border-border/50 pt-3 mt-3 space-y-1.5">
          <div className="h-2.5 w-full rounded bg-border/40 animate-pulse" />
          <div className="h-2.5 w-3/4 rounded bg-border/40 animate-pulse" />
        </div>
      )}
    </div>
  );
}

function WindArrow({ direction }: { direction: number }) {
  if (direction < 0) return null;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="text-accent shrink-0"
    >
      <path
        d="M12 2L8 10h3v12h2V10h3L12 2z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}
