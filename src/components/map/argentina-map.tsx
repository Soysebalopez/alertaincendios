"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PROVINCES } from "@/lib/argentina-cities";
import { AIR_LEVEL_COLORS, type AirLevel } from "@/lib/air-quality";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
}

interface LayerState {
  fires: boolean;
  air: boolean;
  wind: boolean;
}

export function ArgentinaMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.LayerGroup>>({});
  const [layers, setLayers] = useState<LayerState>({
    fires: true,
    air: true,
    wind: false,
  });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ fires: 0, cities: 0 });

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
      { maxZoom: 18 },
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstance.current = map;

    // Fix tile rendering — Leaflet needs a size invalidation after mount
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    // Create layer groups
    layerGroups.current.fires = L.layerGroup().addTo(map);
    layerGroups.current.air = L.layerGroup().addTo(map);
    layerGroups.current.wind = L.layerGroup();

    // Load all data
    loadFires(layerGroups.current.fires);
    loadAirQuality(layerGroups.current.air);
    loadWind(layerGroups.current.wind);

    async function loadFires(group: L.LayerGroup) {
      try {
        const data = await fetch("/api/fires").then((r) => r.json());
        const fires: FirePoint[] = data.fires || [];
        fires.forEach((f) => {
          const radius = Math.max(3, Math.min(8, f.frp / 4));
          const color =
            f.confidence === "h" || f.confidence === "high"
              ? "#ef4444"
              : "#f97316";
          L.circleMarker([f.latitude, f.longitude], {
            radius,
            color,
            fillColor: color,
            fillOpacity: 0.7,
            weight: 1,
          }).addTo(group);
        });
        setStats((s) => ({ ...s, fires: fires.length }));
      } catch {}
    }

    async function loadAirQuality(group: L.LayerGroup) {
      // All cities across all provinces
      const allCities = PROVINCES.flatMap((p) =>
        p.cities.map((c) => ({
          ...c,
          provinceId: p.id,
          provinceName: p.name,
        })),
      );

      let loaded = 0;
      // Load in parallel batches of 10
      for (let i = 0; i < allCities.length; i += 10) {
        const batch = allCities.slice(i, i + 10);
        const results = await Promise.allSettled(
          batch.map((city) =>
            fetch(`/api/air-quality?lat=${city.lat}&lng=${city.lng}`)
              .then((r) => r.json())
              .then((data) => ({ city, data })),
          ),
        );

        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          const { city, data } = result.value;
          if (!data.worstLevel) continue;

          const color =
            AIR_LEVEL_COLORS[data.worstLevel as AirLevel] || "#22c55e";
          const marker = L.circleMarker([city.lat, city.lng], {
            radius: 8,
            color,
            fillColor: color,
            fillOpacity: 0.3,
            weight: 1.5,
          });
          marker.bindTooltip(
            `<b>${city.name}</b> (${city.provinceName})<br/>${data.worstLevelLabel || "Bueno"}`,
            { direction: "top" },
          );
          marker.addTo(group);
          loaded++;
        }
        setStats((s) => ({ ...s, cities: loaded }));
      }
      setLoading(false);
    }

    async function loadWind(group: L.LayerGroup) {
      const sample = PROVINCES.slice(0, 12).map((p) => p.cities[0]);
      for (const city of sample) {
        try {
          const data = await fetch(
            `/api/wind?lat=${city.lat}&lng=${city.lng}`,
          ).then((r) => r.json());

          if (data.windSpeed != null) {
            const size = Math.max(18, Math.min(32, data.windSpeed * 1.5));
            const rotation = (data.windDirection + 180) % 360;

            const icon = L.divIcon({
              html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${rotation}deg)">
                <path d="M12 2L8 14h3v8h2v-8h3L12 2z" fill="#3b82f6" opacity="0.6"/>
              </svg>`,
              className: "",
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });

            L.marker([city.lat, city.lng], { icon })
              .bindTooltip(
                `${data.windSpeed} km/h ${data.windDirectionLabelEs}`,
                { direction: "top" },
              )
              .addTo(group);
          }
        } catch {}
      }
    }

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Toggle layers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    for (const [key, group] of Object.entries(layerGroups.current)) {
      const visible = layers[key as keyof LayerState];
      if (visible && !map.hasLayer(group)) map.addLayer(group);
      if (!visible && map.hasLayer(group)) map.removeLayer(group);
    }
  }, [layers]);

  return (
    <div className="relative w-full" style={{ height: "100%", minHeight: "600px" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      {/* Layer toggles */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-1">
        <LayerToggle
          label="Focos"
          color="#f97316"
          active={layers.fires}
          count={stats.fires}
          onClick={() => setLayers((l) => ({ ...l, fires: !l.fires }))}
        />
        <LayerToggle
          label="Aire"
          color="#22c55e"
          active={layers.air}
          count={stats.cities}
          onClick={() => setLayers((l) => ({ ...l, air: !l.air }))}
        />
        <LayerToggle
          label="Viento"
          color="#3b82f6"
          active={layers.wind}
          onClick={() => setLayers((l) => ({ ...l, wind: !l.wind }))}
        />
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[999]">
          <span className="font-mono text-xs text-muted animate-pulse">
            Cargando datos...
          </span>
        </div>
      )}
    </div>
  );
}

function LayerToggle({
  label,
  color,
  active,
  count,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
        active
          ? "bg-surface-2/90 border border-border text-foreground/90 backdrop-blur-sm"
          : "bg-surface-2/50 border border-transparent text-muted/60 backdrop-blur-sm"
      }`}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: active ? color : "#333" }}
      />
      {label}
      {count != null && active && (
        <span className="text-muted/60">{count}</span>
      )}
    </button>
  );
}
