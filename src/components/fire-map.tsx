"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
  acqDate: string;
  acqTime: string;
  type?: number;
}

/* ─── Filter definitions ─── */

type FireType = 0 | 1 | 2 | 3;

const FIRE_FILTERS: {
  type: FireType;
  label: string;
  icon: string;
  color: string;
}[] = [
  { type: 0, label: "Incendios", icon: "🔥", color: "#e8622c" },
  { type: 1, label: "Volcanes", icon: "🌋", color: "#ef4444" },
  { type: 2, label: "Flaring", icon: "🏭", color: "#8a8a7e" },
  { type: 3, label: "Offshore", icon: "🛢️", color: "#8a8a7e" },
];

/* ─── Helpers ─── */

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

function typeLabel(type?: number): { label: string; color: string } {
  switch (type) {
    case 1:
      return { label: "Volcan", color: "#ef4444" };
    case 2:
      return { label: "Flaring industrial", color: "#8a8a7e" };
    case 3:
      return { label: "Offshore", color: "#8a8a7e" };
    default:
      return { label: "Incendio", color: "#e8622c" };
  }
}

function buildPopup(f: FirePoint): string {
  const level = frpLevel(f.frp);
  const conf = confidenceLabel(f.confidence);
  const tl = typeLabel(f.type);
  const gMapsUrl = `https://www.google.com/maps?q=${f.latitude},${f.longitude}&z=12`;

  const bars = Array.from({ length: 5 }, (_, i) =>
    i < level.bars
      ? `<span style="display:inline-block;width:6px;height:${10 + i * 3}px;background:${level.color};border-radius:1px;margin-right:2px;vertical-align:bottom"></span>`
      : `<span style="display:inline-block;width:6px;height:${10 + i * 3}px;background:#2a2a20;border-radius:1px;margin-right:2px;vertical-align:bottom"></span>`
  ).join("");

  return `<div style="font-family:'Outfit',system-ui,sans-serif;font-size:13px;color:#1a1a17;min-width:220px;line-height:1.5">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${tl.color};background:${tl.color}15;padding:2px 8px;border-radius:4px">${tl.label}</span>
    </div>
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

function createFireMarker(f: FirePoint): L.Layer {
  const isWild = (f.type ?? 0) === 0 || f.type === 1;
  const level = frpLevel(f.frp);

  if (isWild) {
    const size = Math.max(10, Math.min(22, f.frp / 2));
    const icon = L.divIcon({
      className: "",
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size],
      html: `<div style="position:relative;width:${size * 2}px;height:${size * 2}px;display:flex;align-items:center;justify-content:center">
        <span class="thermal-pulse" style="position:absolute;inset:0;border-radius:50%;background:${level.color};opacity:0.25"></span>
        <span style="width:${size}px;height:${size}px;border-radius:50%;background:${level.color};opacity:0.9"></span>
      </div>`,
    });
    return L.marker([f.latitude, f.longitude], { icon }).bindPopup(
      buildPopup(f),
      { maxWidth: 280, className: "fire-popup" }
    );
  }

  return L.circleMarker([f.latitude, f.longitude], {
    radius: Math.max(3, Math.min(6, f.frp / 4)),
    color: "#8a8a7e",
    fillColor: "#8a8a7e",
    fillOpacity: 0.4,
    weight: 1,
  }).bindPopup(buildPopup(f), { maxWidth: 280, className: "fire-popup" });
}

/* ─── Component ─── */

export function FireMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<number, L.LayerGroup>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<FireType>>(
    new Set([0, 1, 2, 3])
  );
  const [counts, setCounts] = useState<Record<number, number>>({});

  const toggleFilter = useCallback((type: FireType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        layerGroups.current[type]?.remove();
      } else {
        next.add(type);
        const map = mapInstance.current;
        if (map && layerGroups.current[type]) {
          layerGroups.current[type].addTo(map);
        }
      }
      return next;
    });
  }, []);

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
        const groups: Record<number, L.LayerGroup> = {};
        const typeCounts: Record<number, number> = {};

        fires.forEach((f) => {
          const t = f.type ?? 0;
          if (!groups[t]) groups[t] = L.layerGroup();
          typeCounts[t] = (typeCounts[t] || 0) + 1;
          createFireMarker(f).addTo(groups[t]);
        });

        Object.values(groups).forEach((group) => group.addTo(map));

        layerGroups.current = groups;
        setCounts(typeCounts);
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

      {/* Filter badges */}
      {!loading && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 z-[1000]">
          {FIRE_FILTERS.map((filter) => {
            const count = counts[filter.type] || 0;
            if (count === 0) return null;
            const isActive = activeFilters.has(filter.type);
            return (
              <button
                key={filter.type}
                onClick={() => toggleFilter(filter.type)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-mono transition-all duration-200 border select-none cursor-pointer"
                style={{
                  background: isActive ? `${filter.color}18` : "#0a0a08cc",
                  borderColor: isActive ? `${filter.color}40` : "#25252080",
                  color: isActive ? filter.color : "#8a8a7e60",
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                <span className="text-sm leading-none">{filter.icon}</span>
                <span>{filter.label}</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ color: isActive ? filter.color : "#8a8a7e40" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

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
