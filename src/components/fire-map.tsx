"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
  acqDate: string;
  acqTime: string;
}

/** Classify FRP into human-readable intensity */
function frpLevel(frp: number): {
  label: string;
  color: string;
  bars: number;
  description: string;
} {
  if (frp < 1)
    return {
      label: "Muy baja",
      color: "#facc15",
      bars: 1,
      description: "Quema menor o actividad industrial (flaring)",
    };
  if (frp < 5)
    return {
      label: "Baja",
      color: "#f97316",
      bars: 2,
      description: "Quema agricola o foco incipiente",
    };
  if (frp < 20)
    return {
      label: "Moderada",
      color: "#ef4444",
      bars: 3,
      description: "Incendio activo en desarrollo",
    };
  if (frp < 50)
    return {
      label: "Alta",
      color: "#dc2626",
      bars: 4,
      description: "Incendio forestal significativo",
    };
  return {
    label: "Muy alta",
    color: "#991b1b",
    bars: 5,
    description: "Incendio de gran magnitud",
  };
}

function confidenceLabel(c: string): string {
  if (c === "h" || c === "high") return "Alta";
  if (c === "n" || c === "nominal") return "Media";
  return "Baja";
}

function buildPopup(f: FirePoint): string {
  const level = frpLevel(f.frp);
  const conf = confidenceLabel(f.confidence);
  const gMapsUrl = `https://www.google.com/maps?q=${f.latitude},${f.longitude}&z=12`;

  // Power bars visualization
  const bars = Array.from({ length: 5 }, (_, i) =>
    i < level.bars
      ? `<span style="display:inline-block;width:6px;height:${10 + i * 3}px;background:${level.color};border-radius:1px;margin-right:2px;vertical-align:bottom"></span>`
      : `<span style="display:inline-block;width:6px;height:${10 + i * 3}px;background:#2a2a20;border-radius:1px;margin-right:2px;vertical-align:bottom"></span>`
  ).join("");

  return `<div style="font-family:'Outfit',system-ui,sans-serif;font-size:13px;color:#1a1a17;min-width:220px;line-height:1.5">
    <div style="font-weight:600;font-size:14px;margin-bottom:8px;color:${level.color}">
      ${level.description}
    </div>

    <div style="display:flex;align-items:end;gap:8px;margin-bottom:10px;padding:8px;background:#f5f5f0;border-radius:6px">
      <div>${bars}</div>
      <div style="font-size:11px;color:#6b6b60">
        <b>${f.frp} MW</b> — Potencia ${level.label}
      </div>
    </div>

    <div style="font-size:12px;color:#444;margin-bottom:6px">
      Confianza: <b>${conf}</b>
    </div>

    <div style="font-size:11px;color:#888;margin-bottom:10px">
      ${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}
    </div>

    <a href="${gMapsUrl}" target="_blank" rel="noopener noreferrer"
       style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#e8622c;text-decoration:none;font-weight:500">
      Ver en Google Maps &#8599;
    </a>
  </div>`;
}

export function FireMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [-38, -64],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    mapInstance.current = map;

    fetch("/api/fires")
      .then((r) => r.json())
      .then((data) => {
        const fires: FirePoint[] = data.fires || [];
        fires.forEach((f) => {
          const level = frpLevel(f.frp);
          const radius = Math.max(4, Math.min(10, f.frp / 3));
          const opacity =
            f.confidence === "h" || f.confidence === "high" ? 0.9 : 0.6;

          L.circleMarker([f.latitude, f.longitude], {
            radius,
            color: level.color,
            fillColor: level.color,
            fillOpacity: opacity,
            weight: 1.5,
          })
            .bindPopup(buildPopup(f), {
              maxWidth: 280,
              className: "fire-popup",
            })
            .addTo(map);
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="font-mono text-xs text-muted animate-pulse">
            Cargando focos...
          </span>
        </div>
      )}
    </div>
  );
}
