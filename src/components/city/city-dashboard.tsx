"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { WindCard } from "./wind-card";
import { LevelBadge } from "../air-quality/level-badge";

const CityMap = dynamic(() => import("./city-map").then((m) => m.CityMap), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-border bg-surface-2 h-[350px] flex items-center justify-center">
      <span className="font-mono text-xs text-muted animate-pulse">
        Cargando mapa...
      </span>
    </div>
  ),
});
import { PollutantChart } from "./pollutant-chart";
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

interface AirData {
  pollutants: Record<string, PollutantData>;
  worstLevel: AirLevel;
  worstLevelLabel: string;
}

const DISPLAY_ORDER = ["NO2", "SO2", "O3", "PM25", "PM10", "CO"];

export function CityDashboard({
  cityName,
  provinceName,
  lat,
  lng,
}: {
  cityName: string;
  provinceName: string;
  lat: number;
  lng: number;
}) {
  const [air, setAir] = useState<AirData | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pollutants) setAir(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Non-blocking AI summary
    fetch(
      `/api/summary?lat=${lat}&lng=${lng}&city=${encodeURIComponent(cityName)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {});
  }, [lat, lng, cityName]);

  return (
    <div className="space-y-6">
      {/* Semaphore hero */}
      {air && (
        <div className="rounded-xl border border-border bg-surface-2 p-6">
          <div className="flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center thermal-pulse"
              style={{
                backgroundColor: `${AIR_LEVEL_COLORS[air.worstLevel]}20`,
              }}
            >
              <div
                className="h-5 w-5 rounded-full"
                style={{
                  backgroundColor: AIR_LEVEL_COLORS[air.worstLevel],
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <p className="font-mono text-xs text-muted uppercase tracking-wide">
                  Calidad del aire
                </p>
                <LevelBadge level={air.worstLevel} />
              </div>
              <p className="text-xs text-muted">
                Calidad del aire actual en {cityName} segun umbrales OMS
              </p>
            </div>
          </div>

          {/* AI summary */}
          {summary ? (
            <p className="text-sm text-foreground/80 leading-relaxed border-t border-border/50 pt-4 mt-4">
              {summary}
            </p>
          ) : (
            <div className="border-t border-border/50 pt-4 mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-border/40 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-border/40 animate-pulse" />
            </div>
          )}
        </div>
      )}

      {loading && !air && (
        <div className="rounded-xl border border-border bg-surface-2 p-6">
          <div className="h-12 w-full rounded bg-border/50 animate-pulse" />
        </div>
      )}

      {/* Wind + Pollutants grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <WindCard lat={lat} lng={lng} />

        {air && (
          <div className="rounded-xl border border-border bg-surface-2 p-5">
            <p className="font-mono text-[10px] text-muted/60 uppercase tracking-widest mb-4">
              Contaminantes
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {DISPLAY_ORDER.map((key) => {
                const p = air.pollutants[key];
                if (!p) return null;
                const color = AIR_LEVEL_COLORS[p.level];
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-mono text-xs text-muted">
                        {POLLUTANT_LABELS[key] || key}
                      </span>
                    </div>
                    <p className="font-mono text-lg font-semibold text-foreground/90 pl-4">
                      {p.value}
                      <span className="text-xs text-muted/60 ml-1">
                        {p.unit}
                      </span>
                    </p>
                    <p
                      className="text-[10px] font-medium pl-4"
                      style={{ color }}
                    >
                      {p.levelLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Map — full width, taller like SatAI */}
      <div className="rounded-xl border border-border overflow-hidden h-[500px]">
        <CityMap lat={lat} lng={lng} cityName={cityName} />
      </div>

      {/* Air quality evolution */}
      <AirHistorySection lat={lat} lng={lng} />

      {/* Source attribution */}
      <p className="font-mono text-[10px] text-muted/40 text-center">
        Datos: CAMS / Sentinel-5P via Open-Meteo — Umbrales OMS —{" "}
        {provinceName}
      </p>
    </div>
  );
}

/* ─── Air quality history section ─── */

const POLLUTANTS = [
  { key: "NO2", label: "Dioxido de nitrogeno (NO₂)", color: "#0d9488" },
  { key: "SO2", label: "Dioxido de azufre (SO₂)", color: "#eab308" },
  { key: "O3", label: "Ozono (O₃)", color: "#8b5cf6" },
  { key: "PM25", label: "Particulas finas (PM2.5)", color: "#ef4444" },
  { key: "PM10", label: "Particulas gruesas (PM10)", color: "#f97316" },
  { key: "CO", label: "Monoxido de carbono (CO)", color: "#6b7280" },
] as const;

const DAY_OPTIONS = [
  { value: 3, label: "3 dias" },
  { value: 7, label: "7 dias" },
  { value: 14, label: "14 dias" },
  { value: 30, label: "30 dias" },
] as const;

function AirHistorySection({ lat, lng }: { lat: number; lng: number }) {
  const [days, setDays] = useState(7);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-[10px] text-muted/60 uppercase tracking-widest">
          Evolucion de la calidad del aire
        </p>
        <div className="flex gap-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97] ${
                days === opt.value
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-muted border border-border"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top 2 pollutants — wider */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {POLLUTANTS.slice(0, 2).map((p) => (
          <PollutantChart
            key={p.key}
            pollutant={p.key}
            label={p.label}
            color={p.color}
            lat={lat}
            lng={lng}
            days={days}
          />
        ))}
      </div>

      {/* Remaining 4 — smaller grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {POLLUTANTS.slice(2).map((p) => (
          <PollutantChart
            key={p.key}
            pollutant={p.key}
            label={p.label}
            color={p.color}
            lat={lat}
            lng={lng}
            days={days}
          />
        ))}
      </div>
    </div>
  );
}
