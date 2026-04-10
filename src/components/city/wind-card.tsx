"use client";

import { useEffect, useState } from "react";

interface WindData {
  windSpeed: number;
  windDirection: number;
  windDirectionLabelEs: string;
  windGusts: number;
  temperature: number;
  humidity: number;
}

export function WindCard({ lat, lng }: { lat: number; lng: number }) {
  const [wind, setWind] = useState<WindData | null>(null);

  useEffect(() => {
    fetch(`/api/wind?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.windSpeed != null) setWind(data);
      })
      .catch(() => {});
  }, [lat, lng]);

  if (!wind) {
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-5">
        <div className="h-3 w-16 rounded bg-border animate-pulse mb-3" />
        <div className="h-8 w-32 rounded bg-border/50 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-5">
      <p className="font-mono text-[11px] text-muted uppercase tracking-widest mb-3">
        Viento
      </p>

      <div className="flex items-center gap-4">
        {/* Wind arrow */}
        <div className="relative h-14 w-14 shrink-0">
          <div className="absolute inset-0 rounded-full border border-border/50" />
          <svg
            viewBox="0 0 48 48"
            className="h-14 w-14 text-accent"
            style={{
              transform: `rotate(${(wind.windDirection + 180) % 360}deg)`,
              transition: "transform 0.5s ease",
            }}
          >
            <path
              d="M24 6L18 22h4v20h4V22h4L24 6z"
              fill="currentColor"
              opacity="0.8"
            />
          </svg>
        </div>

        <div>
          <p className="text-2xl font-bold tracking-tight text-foreground/90">
            {wind.windSpeed}{" "}
            <span className="text-sm font-normal text-muted">km/h</span>
          </p>
          <p className="text-sm text-muted">
            {wind.windDirectionLabelEs}
          </p>
        </div>
      </div>

      <div className="flex gap-6 mt-4 pt-3 border-t border-border/50">
        <Stat label="Temp" value={`${wind.temperature}°C`} />
        <Stat label="Humedad" value={`${wind.humidity}%`} />
        <Stat label="Rafagas" value={`${wind.windGusts} km/h`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] text-muted uppercase tracking-widest mb-0.5">
        {label}
      </p>
      <p className="font-mono text-xs text-foreground/70">{value}</p>
    </div>
  );
}
