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

export function WindCompassCard({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const [wind, setWind] = useState<WindData | null>(null);

  useEffect(() => {
    fetch(`/api/wind?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.windSpeed != null) setWind(data);
      })
      .catch(() => {});
  }, [lat, lng]);

  return (
    <div
      style={{
        padding: 22,
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-3.5">
        Viento y clima
      </div>

      <div className="text-center" style={{ padding: "16px 0" }}>
        <svg
          viewBox="0 0 100 100"
          width="140"
          height="140"
          className="mx-auto block"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1"
            strokeDasharray="2 6"
            opacity="0.4"
          />
          {["N", "E", "S", "O"].map((dir, i) => (
            <text
              key={dir}
              x={50 + Math.cos(((i * 90 - 90) * Math.PI) / 180) * 38}
              y={50 + Math.sin(((i * 90 - 90) * Math.PI) / 180) * 38 + 3}
              fontFamily="var(--font-mono)"
              fontSize="8"
              fill="var(--muted)"
              textAnchor="middle"
            >
              {dir}
            </text>
          ))}
          {wind && (
            <g
              style={{ transition: "transform 0.6s ease" }}
              transform={`translate(50 50) rotate(${wind.windDirection})`}
            >
              <path
                d="M 0 -28 L -6 6 L 0 0 L 6 6 Z"
                fill="var(--accent)"
              />
            </g>
          )}
          <circle cx="50" cy="50" r="3" fill="var(--foreground)" />
        </svg>
        <div
          className="text-foreground mt-2"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {wind?.windSpeed ?? "—"}
          <span
            className="text-muted"
            style={{ fontSize: 14, fontWeight: 400 }}
          >
            {" "}
            km/h
          </span>
        </div>
        <div className="font-mono text-[11px] text-muted tracking-[0.12em] uppercase">
          {wind
            ? `Dirección ${wind.windDirectionLabelEs}`
            : "Cargando dirección"}
        </div>
      </div>

      <div
        className="grid pt-3.5 border-t border-border"
        style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
      >
        <Stat label="Temp" value={wind ? `${wind.temperature}°` : "—"} />
        <Stat label="Humedad" value={wind ? `${wind.humidity}%` : "—"} />
        <Stat label="Ráfagas" value={wind ? `${wind.windGusts}` : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="font-mono text-muted uppercase mb-0.5"
        style={{ fontSize: 9, letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <div className="font-mono text-[13px] text-foreground">{value}</div>
    </div>
  );
}

// Keep legacy export for backward compatibility
export { WindCompassCard as WindCard };
