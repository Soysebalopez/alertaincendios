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

interface CitySlide {
  name: string;
  provinceName: string;
  provinceId: string;
  lat: number;
  lng: number;
  slug: string;
}

interface SlideData {
  level: AirLevel;
  windSpeed: number;
  windDirectionLabelEs: string;
  temperature: number;
  summary: string | null;
}

/** Pick 10 random cities from all provinces */
function pickRandomCities(count: number): CitySlide[] {
  const all = PROVINCES.flatMap((p) =>
    p.cities.map((c) => ({
      name: c.name,
      provinceName: p.name,
      provinceId: p.id,
      lat: c.lat,
      lng: c.lng,
      slug: c.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    })),
  );
  // Shuffle and pick
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

const LiveStatus = React.memo(function LiveStatus() {
  const [cities] = useState(() => pickRandomCities(10));
  const [current, setCurrent] = useState(0);
  const [data, setData] = useState<Map<number, SlideData>>(new Map());
  const [direction, setDirection] = useState<"next" | "prev">("next");

  const city = cities[current];

  // Fetch data for current city
  const fetchCity = useCallback(
    (idx: number) => {
      if (data.has(idx)) return;
      const c = cities[idx];

      Promise.all([
        fetch(`/api/air-quality?lat=${c.lat}&lng=${c.lng}`)
          .then((r) => r.json())
          .catch(() => null),
        fetch(`/api/wind?lat=${c.lat}&lng=${c.lng}`)
          .then((r) => r.json())
          .catch(() => null),
      ]).then(([airRes, windRes]) => {
        let level: AirLevel = "good";
        if (airRes?.pollutants) {
          const levels: AirLevel[] = [];
          const p = airRes.pollutants;
          if (p.NO2) levels.push(getAirLevel("NO2", p.NO2.value));
          if (p.SO2) levels.push(getAirLevel("SO2", p.SO2.value));
          if (p.PM25) levels.push(getAirLevel("PM25", p.PM25.value));
          if (p.O3) levels.push(getAirLevel("O3", p.O3.value));
          const priority: AirLevel[] = ["dangerous", "bad", "moderate", "good"];
          level = priority.find((pr) => levels.includes(pr)) || "good";
        }

        setData((prev) => {
          const next = new Map(prev);
          next.set(idx, {
            level,
            windSpeed: windRes?.windSpeed ?? 0,
            windDirectionLabelEs: windRes?.windDirectionLabelEs ?? "",
            temperature: windRes?.temperature ?? 0,
            summary: null,
          });
          return next;
        });
      });

      // Non-blocking AI summary
      fetch(
        `/api/summary?lat=${c.lat}&lng=${c.lng}&city=${encodeURIComponent(c.name)}`,
      )
        .then((r) => r.json())
        .then((res) => {
          if (res.summary) {
            setData((prev) => {
              const next = new Map(prev);
              const existing = next.get(idx);
              if (existing) next.set(idx, { ...existing, summary: res.summary });
              return next;
            });
          }
        })
        .catch(() => {});
    },
    [cities, data],
  );

  useEffect(() => {
    fetchCity(current);
    // Prefetch next
    if (current + 1 < cities.length) fetchCity(current + 1);
  }, [current, fetchCity, cities.length]);

  // Auto-advance every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setDirection("next");
      setCurrent((i) => (i + 1) % cities.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [cities.length]);

  const slideData = data.get(current);
  const color = slideData
    ? AIR_LEVEL_COLORS[slideData.level]
    : AIR_LEVEL_COLORS.good;
  const label = slideData
    ? AIR_LEVEL_LABELS[slideData.level]
    : "";

  const goTo = (idx: number) => {
    setDirection(idx > current ? "next" : "prev");
    setCurrent(idx);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-2 px-5 py-4 overflow-hidden">
      {/* City name + nav dots */}
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/ciudad/${city.provinceId}/${city.slug}`}
          className="group flex items-center gap-2"
        >
          <p className="text-sm font-semibold text-foreground/90 group-hover:text-accent transition-colors">
            {city.name}
          </p>
          <span className="text-xs text-muted font-mono">
            {city.provinceName}
          </span>
        </Link>

        {/* Nav arrows */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => goTo((current - 1 + cities.length) % cities.length)}
            className="text-muted hover:text-foreground/80 text-xs transition-colors"
            aria-label="Anterior"
          >
            ←
          </button>
          <span className="font-mono text-xs text-muted">
            {current + 1}/{cities.length}
          </span>
          <button
            onClick={() => goTo((current + 1) % cities.length)}
            className="text-muted hover:text-foreground/80 text-xs transition-colors"
            aria-label="Siguiente"
          >
            →
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        key={current}
        className={`animate-slide-${direction}`}
      >
        {slideData ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="thermal-pulse flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${color}20` }}
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-muted">
                    Calidad del aire
                  </span>
                  <span
                    className="text-xs font-semibold uppercase"
                    style={{ color }}
                  >
                    {label}
                  </span>
                </div>
                {slideData.windSpeed > 0 && (
                  <p className="text-sm text-foreground/70">
                    {slideData.windSpeed} km/h{" "}
                    {slideData.windDirectionLabelEs.toLowerCase()} —{" "}
                    {slideData.temperature}°C
                  </p>
                )}
              </div>
            </div>

            {slideData.summary ? (
              <p className="text-sm text-foreground/60 leading-relaxed border-t border-border/50 pt-2">
                {slideData.summary}
              </p>
            ) : (
              <div className="border-t border-border/50 pt-2 space-y-1.5">
                <div className="h-2.5 w-full rounded bg-border/30 animate-pulse" />
                <div className="h-2.5 w-3/4 rounded bg-border/30 animate-pulse" />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="h-8 w-48 rounded bg-border/30 animate-pulse" />
            <div className="h-2.5 w-full rounded bg-border/30 animate-pulse" />
          </div>
        )}
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-3">
        {cities.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`h-1 rounded-full transition-all ${
              i === current
                ? "w-4 bg-accent"
                : "w-1 bg-border hover:bg-muted/50"
            }`}
            aria-label={`Ciudad ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
});

export { LiveStatus };
