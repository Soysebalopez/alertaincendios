"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { AIR_LEVEL_COLORS, type AirLevel } from "@/lib/air-quality";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
}

interface AirRes {
  pollutants: Record<string, { value: number; unit: string; level: AirLevel }>;
  worstLevel: AirLevel;
  worstLevelLabel: string;
}

interface WindRes {
  windSpeed: number;
  windDirection: number;
  windDirectionLabelEs: string;
  temperature: number;
}

export function CityMap({
  lat,
  lng,
  cityName,
}: {
  lat: number;
  lng: number;
  cityName: string;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [air, setAir] = useState<AirRes | null>(null);
  const [wind, setWind] = useState<WindRes | null>(null);
  const [fireCount, setFireCount] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { maxZoom: 18 },
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstance.current = map;

    // City center marker
    const cityIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#e8622c;border:2px solid #0a0a08;box-shadow:0 0 12px rgba(232,98,44,0.5)"></div>`,
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([lat, lng], { icon: cityIcon })
      .bindTooltip(cityName, {
        permanent: true,
        direction: "top",
        offset: [0, -10],
      })
      .addTo(map);

    // Load fires layer
    fetch("/api/fires")
      .then((r) => r.json())
      .then((data) => {
        const fires: FirePoint[] = data.fires || [];
        const nearby = fires.filter((f) => {
          const d = Math.sqrt(
            (f.latitude - lat) ** 2 + (f.longitude - lng) ** 2,
          );
          return d < 1;
        });
        nearby.forEach((f) => {
          const color =
            f.confidence === "h" || f.confidence === "high"
              ? "#ef4444"
              : "#f97316";
          L.circleMarker([f.latitude, f.longitude], {
            radius: Math.max(4, Math.min(8, f.frp / 4)),
            color,
            fillColor: color,
            fillOpacity: 0.7,
            weight: 1,
          }).addTo(map);
        });
        setFireCount(nearby.length);
      })
      .catch(() => {});

    // Load air quality
    fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pollutants) setAir(data);
        // Air quality circle on map
        if (data.worstLevel) {
          const color = AIR_LEVEL_COLORS[data.worstLevel as AirLevel];
          L.circle([lat, lng], {
            radius: 2000,
            color,
            fillColor: color,
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: "4 4",
          }).addTo(map);
        }
      })
      .catch(() => {});

    // Load wind
    fetch(`/api/wind?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.windSpeed != null) {
          setWind(data);
          // Wind arrows on grid around city
          const offsets = [
            [0, 0],
            [0.02, 0.02],
            [-0.02, 0.02],
            [0.02, -0.02],
            [-0.02, -0.02],
            [0.04, 0],
            [-0.04, 0],
            [0, 0.04],
            [0, -0.04],
          ];
          const rotation = (data.windDirection + 180) % 360;
          const size = Math.max(18, Math.min(28, data.windSpeed * 1.2));
          offsets.forEach(([dlat, dlng]) => {
            const icon = L.divIcon({
              html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${rotation}deg)">
                <path d="M12 2L8 14h3v8h2v-8h3L12 2z" fill="#3b82f6" opacity="0.45"/>
              </svg>`,
              className: "",
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });
            L.marker([lat + dlat, lng + dlng], { icon, interactive: false }).addTo(map);
          });
        }
      })
      .catch(() => {});

    // AI summary (non-blocking)
    fetch(
      `/api/summary?lat=${lat}&lng=${lng}&city=${encodeURIComponent(cityName)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {});

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [lat, lng, cityName]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Data panel — left side, SatAI style */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 w-64 max-h-[calc(100%-24px)] overflow-y-auto">
        {/* Citizen summary */}
        <CollapsibleCard title="Resumen ciudadano" accent="#e8622c">
          {summary ? (
            <p className="text-xs text-foreground/70 leading-relaxed">
              {summary}
            </p>
          ) : (
            <div className="space-y-1.5">
              <div className="h-2.5 w-full rounded bg-border/40 animate-pulse" />
              <div className="h-2.5 w-3/4 rounded bg-border/40 animate-pulse" />
            </div>
          )}
        </CollapsibleCard>

        {/* Air quality */}
        {air && (
          <CollapsibleCard title="Calidad del aire">
            <div className="space-y-1">
              {Object.entries(air.pollutants)
                .slice(0, 6)
                .map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-muted">{key}</span>
                    <span className="font-mono text-foreground/70">
                      {val.value}{" "}
                      <span className="text-muted/60">{val.unit}</span>
                    </span>
                  </div>
                ))}
            </div>
          </CollapsibleCard>
        )}

        {/* Wind */}
        {wind && (
          <CollapsibleCard title="Viento">
            <div className="flex items-center gap-2 mb-1">
              <svg
                className="w-4 h-4 text-[#3b82f6]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: `rotate(${(wind.windDirection + 180) % 360}deg)`,
                }}
              >
                <path d="M12 2l0 20M12 2l-4 4M12 2l4 4" />
              </svg>
              <span className="text-sm font-medium text-foreground/90">
                {wind.windSpeed} km/h
              </span>
              <span className="text-xs text-muted">
                {wind.windDirectionLabelEs}
              </span>
            </div>
          </CollapsibleCard>
        )}

        {/* Fires */}
        {fireCount > 0 && (
          <CollapsibleCard title="Focos de calor" accent="#f97316">
            <p className="text-xs text-muted">
              {fireCount} foco(s) detectado(s) en un radio de 100 km.
            </p>
          </CollapsibleCard>
        )}
      </div>
    </div>
  );
}

function CollapsibleCard({
  title,
  accent,
  defaultOpen = true,
  children,
}: {
  title: string;
  accent?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-background/90 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 text-left"
      >
        <p
          className="text-[10px] font-mono tracking-wider uppercase"
          style={{ color: accent || "#6b6b60" }}
        >
          {title}
        </p>
        {open ? (
          <CaretUp className="w-3 h-3 text-muted" weight="bold" />
        ) : (
          <CaretDown className="w-3 h-3 text-muted" weight="bold" />
        )}
      </button>
      {open && <div className="px-3 pb-3 -mt-1">{children}</div>}
    </div>
  );
}
