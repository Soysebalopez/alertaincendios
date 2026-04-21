"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { WindCompassCard } from "./wind-card";
import { Pill } from "@/components/clara-ui";
import { ChartLineUp } from "@phosphor-icons/react/dist/ssr";
import { PollutantChart } from "./pollutant-chart";
import {
  AIR_LEVEL_COLORS,
  AIR_LEVEL_LABELS,
  POLLUTANT_LABELS,
  type AirLevel,
} from "@/lib/air-quality";

const CityMap = dynamic(() => import("./city-map").then((m) => m.CityMap), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center"
      style={{
        height: 360,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <span className="font-mono text-xs text-muted animate-pulse">
        Cargando mapa...
      </span>
    </div>
  ),
});

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

const POLLUTANT_ORDER: { key: string; displayUnit?: string }[] = [
  { key: "NO2" },
  { key: "SO2" },
  { key: "O3" },
  { key: "PM25" },
  { key: "PM10" },
  { key: "CO" },
];

const POLLUTANT_CHARTS = [
  {
    key: "PM25",
    label: "PM2.5 · Partículas finas",
    color: AIR_LEVEL_COLORS.bad,
  },
  {
    key: "NO2",
    label: "NO₂ · Dióxido de nitrógeno",
    color: "var(--accent)",
  },
  {
    key: "O3",
    label: "O₃ · Ozono troposférico",
    color: AIR_LEVEL_COLORS.good,
  },
];

const DAY_OPTIONS = [3, 7, 14, 30] as const;

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
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(7);

  useEffect(() => {
    fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pollutants) setAir(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch(
      `/api/summary?lat=${lat}&lng=${lng}&city=${encodeURIComponent(cityName)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {});
  }, [lat, lng, cityName]);

  const worstColor = air ? AIR_LEVEL_COLORS[air.worstLevel] : "var(--muted)";
  const worstLabel = air ? AIR_LEVEL_LABELS[air.worstLevel] : "Cargando";

  return (
    <div className="grid gap-4">
      {/* Semaphore hero + AI summary */}
      <div
        className="relative overflow-hidden"
        style={{
          padding: 28,
          borderRadius: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          className="absolute left-0 right-0 top-0"
          style={{
            height: 3,
            background: `linear-gradient(90deg, ${worstColor}, ${worstColor}00)`,
          }}
        />
        <div className="clara-ciudad-hero flex items-center gap-5 flex-wrap mb-5">
          <div
            className="relative grid place-items-center"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: worstColor + "22",
            }}
          >
            <span
              className="absolute rounded-full beacon-ping"
              style={{
                inset: -8,
                border: `1px solid ${worstColor}`,
                opacity: 0.3,
              }}
            />
            <div
              className="rounded-full"
              style={{
                width: 32,
                height: 32,
                background: worstColor,
                boxShadow: `0 0 20px ${worstColor}`,
              }}
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-1.5">
              Calidad del aire actual
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 32,
                  fontWeight: 800,
                  color: worstColor,
                  letterSpacing: "-0.02em",
                }}
              >
                {worstLabel}
              </span>
              <span className="font-mono text-[12px] text-muted">
                según umbrales OMS · {cityName}
              </span>
            </div>
          </div>
        </div>
        <div
          className="pt-5 border-t border-border flex gap-4 items-start flex-wrap"
        >
          <Pill tone="accent" style={{ flexShrink: 0 }}>
            IA · Resumen ciudadano
          </Pill>
          {summary ? (
            <p
              className="m-0"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color:
                  "color-mix(in oklab, var(--foreground) 85%, transparent)",
              }}
            >
              {summary}
            </p>
          ) : loading ? (
            <div className="flex-1 space-y-2">
              <div className="h-3 w-full rounded bg-border/40 animate-pulse" />
              <div className="h-3 w-4/5 rounded bg-border/40 animate-pulse" />
            </div>
          ) : (
            <p className="text-muted text-[13px]">
              Resumen generado a partir de los valores actuales de
              contaminantes y la guía OMS 2021.
            </p>
          )}
        </div>
      </div>

      {/* Wind + Pollutants */}
      <div
        className="clara-two-col grid"
        style={{ gridTemplateColumns: "1fr 2fr", gap: 16 }}
      >
        <WindCompassCard lat={lat} lng={lng} />

        <div
          style={{
            padding: 22,
            borderRadius: 14,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-3.5">
            Contaminantes · OMS
          </div>
          {air ? (
            <div
              className="clara-pollutant-grid grid"
              style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}
            >
              {POLLUTANT_ORDER.map(({ key }) => {
                const p = air.pollutants[key];
                if (!p) return null;
                const color = AIR_LEVEL_COLORS[p.level];
                return (
                  <div
                    key={key}
                    style={{
                      paddingLeft: 12,
                      borderLeft: `2px solid ${color}`,
                    }}
                  >
                    <div className="font-mono text-[10px] text-muted uppercase tracking-[0.08em]">
                      {POLLUTANT_LABELS[key] || key}
                    </div>
                    <div
                      className="font-mono text-foreground font-medium mt-1"
                      style={{ fontSize: 22, letterSpacing: "-0.02em" }}
                    >
                      {p.value}
                      <span className="text-[10px] text-muted ml-0.5">
                        {p.unit}
                      </span>
                    </div>
                    <div
                      className="font-mono text-[10px] font-semibold mt-1 uppercase"
                      style={{ color, letterSpacing: "0.06em" }}
                    >
                      {p.levelLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}
            >
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-12 rounded bg-border/50 animate-pulse" />
                  <div className="h-5 w-20 rounded bg-border/50 animate-pulse" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div
        className="overflow-hidden"
        style={{
          borderRadius: 14,
          border: "1px solid var(--border)",
          height: 360,
          background: "var(--surface)",
        }}
      >
        <CityMap lat={lat} lng={lng} cityName={cityName} />
      </div>

      {/* Evolution */}
      <div>
        <div className="flex justify-between items-center mb-3.5 flex-wrap gap-3">
          <div>
            <Pill>
              <ChartLineUp size={10} weight="duotone" /> Evolución temporal
            </Pill>
            <h3
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: "10px 0 0",
              }}
            >
              Histórico por contaminante
            </h3>
          </div>
          <div
            className="flex gap-1"
            style={{
              padding: 4,
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            {DAY_OPTIONS.map((dy) => (
              <button
                key={dy}
                onClick={() => setDays(dy)}
                className="font-mono transition-colors"
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: days === dy ? "var(--accent)" : "transparent",
                  color: days === dy ? "#fff" : "var(--muted)",
                  cursor: "pointer",
                  fontSize: 11,
                  letterSpacing: "0.06em",
                }}
              >
                {dy}d
              </button>
            ))}
          </div>
        </div>
        <div
          className="clara-evolution-grid grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {POLLUTANT_CHARTS.map((p) => (
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

      <p
        className="font-mono text-[10px] text-muted text-center mt-5 mb-0"
        style={{ letterSpacing: "0.06em" }}
      >
        Datos: CAMS / Sentinel-5P via Open-Meteo · Umbrales OMS 2021 ·{" "}
        {provinceName}
      </p>
    </div>
  );
}
