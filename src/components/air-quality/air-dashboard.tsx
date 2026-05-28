"use client";

import { useMemo, useState } from "react";
import { CityCard } from "./city-card";
import { PROVINCES, type Province } from "@/lib/argentina-cities";

type Filter = "all" | "good" | "moderate" | "bad";

const FILTER_OPTS: {
  id: Filter;
  label: string;
  color?: string;
}[] = [
  { id: "all", label: "Todos" },
  { id: "good", label: "Bueno", color: "var(--good)" },
  { id: "moderate", label: "Moderado", color: "var(--warn)" },
  { id: "bad", label: "Malo", color: "var(--bad)" },
];

export function AirDashboard() {
  // Default to the first province with cities (Buenos Aires)
  const defaultProvince = useMemo<Province>(
    () => PROVINCES.find((p) => p.cities.length > 0) ?? PROVINCES[0],
    [],
  );
  const [province, setProvince] = useState<Province>(defaultProvince);
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <>
      {/* Sticky filter bar */}
      <section
        className="clara-sticky-filter sticky z-10 border-b border-border"
        style={{
          top: 57,
          padding: "16px 32px",
          background:
            "color-mix(in oklab, var(--background) 90%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div className="max-w-[1400px] mx-auto flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
              Provincia
            </span>
            <select
              value={province.id}
              onChange={(e) => {
                const next = PROVINCES.find((p) => p.id === e.target.value);
                if (next) setProvince(next);
              }}
              className="text-[13px] cursor-pointer"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {PROVINCES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1" />
          <div
            className="flex gap-1"
            style={{
              padding: 4,
              borderRadius: 10,
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            {FILTER_OPTS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 7,
                    border: "none",
                    background: active ? "var(--surface-2)" : "transparent",
                    color: active ? "var(--foreground)" : "var(--muted)",
                    cursor: "pointer",
                  }}
                >
                  {f.color && (
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 7, height: 7, background: f.color }}
                    />
                  )}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Leyenda de niveles — copy refresh: explica los filtros de arriba
          en lenguaje de vecino, sin siglas técnicas (μg/m³, PM, NO₂). */}
      <section
        className="clara-section-padded border-b border-border"
        style={{ padding: "24px 32px", background: "var(--surface)" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <div
            className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-3"
          >
            ¿Qué significa cada nivel?
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {[
              {
                color: "var(--good)",
                emoji: "🟢",
                label: "Bueno",
                body: "El aire está limpio. No hay restricciones.",
              },
              {
                color: "var(--warn)",
                emoji: "🟡",
                label: "Moderado",
                body: "Puede afectar a personas sensibles (asmáticos, adultos mayores, niños pequeños).",
              },
              {
                color: "var(--bad)",
                emoji: "🔴",
                label: "Malo",
                body: "Se recomienda evitar actividad física al aire libre y mantener las ventanas cerradas.",
              },
            ].map((lv) => (
              <div
                key={lv.label}
                className="flex items-start gap-2.5"
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderLeft: `3px solid ${lv.color}`,
                }}
              >
                <span aria-hidden style={{ fontSize: 14, lineHeight: 1.4 }}>
                  {lv.emoji}
                </span>
                <div>
                  <div
                    className="font-semibold text-[13px] text-foreground"
                    style={{ marginBottom: 2 }}
                  >
                    {lv.label}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 12.5, lineHeight: 1.5 }}
                  >
                    {lv.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cards grid */}
      <section
        className="clara-section-padded"
        style={{ padding: "32px 32px 80px" }}
      >
        <div
          className="max-w-[1400px] mx-auto grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          {province.cities.map((c) => {
            const slug = c.name
              .toLowerCase()
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "");
            return (
              <CityCard
                key={`${province.id}-${c.name}`}
                name={c.name}
                lat={c.lat}
                lng={c.lng}
                href={`/ciudad/${province.id}/${slug}`}
                filter={filter}
              />
            );
          })}
        </div>
      </section>
    </>
  );
}
