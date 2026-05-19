"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PROVINCES } from "@/lib/argentina-cities";
import { AIR_LEVEL_COLORS, type AirLevel } from "@/lib/air-quality";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
  type?: number;
  /** WHI-757: id de zona forestal, viene desde fetchFires() vía /api/fires. */
  forestZone?: string;
}

interface LayerState {
  fires: boolean;
  air: boolean;
  wind: boolean;
}

type Intensity = "high" | "moderate" | "low";

/**
 * Coordinado con el hero y src/components/fire-map.tsx — mismos tres
 * niveles para que el lenguaje del producto sea consistente.
 */
const INTENSITY_META: Record<
  Intensity,
  { label: string; color: string; range: string }
> = {
  high: { label: "Alta intensidad", color: "#dc2626", range: "≥ 20 MW" },
  moderate: { label: "Moderada", color: "#ef4444", range: "5–20 MW" },
  low: { label: "Baja", color: "#f97316", range: "< 5 MW" },
};

function frpBucket(frp: number): Intensity {
  if (frp >= 20) return "high";
  if (frp >= 5) return "moderate";
  return "low";
}

export function ArgentinaMap() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.LayerGroup>>({});
  // Fires se renderizan por intensidad — los guardamos crudos en memoria
  // para repintar al cambiar filtros sin re-fetchear /api/fires.
  const allFires = useRef<FirePoint[]>([]);
  const [layers, setLayers] = useState<LayerState>({
    fires: true,
    air: true,
    wind: false,
  });
  const [intensities, setIntensities] = useState<Set<Intensity>>(
    new Set(["high", "moderate", "low"])
  );
  const [intensityCounts, setIntensityCounts] = useState<Record<Intensity, number>>({
    high: 0,
    moderate: 0,
    low: 0,
  });
  // WHI-757: por default mostramos solo focos en zona forestal. El usuario puede
  // activar "ver no-forestal" para sumar quemas agrícolas/flaring (visual más bajo).
  const [showNonForest, setShowNonForest] = useState(false);
  const [nonForestCount, setNonForestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ fires: 0, cities: 0 });

  const toggleIntensity = useCallback((key: Intensity) => {
    setIntensities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
    loadFires();
    loadAirQuality(layerGroups.current.air);
    loadWind(layerGroups.current.wind);

    async function loadFires() {
      try {
        const data = await fetch("/api/fires").then((r) => r.json());
        const fires: FirePoint[] = data.fires || [];
        allFires.current = fires;
        const c: Record<Intensity, number> = { high: 0, moderate: 0, low: 0 };
        let nonForest = 0;
        for (const f of fires) {
          if (f.forestZone) c[frpBucket(f.frp)]++;
          else nonForest++;
        }
        setIntensityCounts(c);
        setNonForestCount(nonForest);
        // El contador top-level "Focos" refleja únicamente los forestales por
        // default. Suma los no-forestales solo cuando el toggle está activo.
        setStats((s) => ({ ...s, fires: c.high + c.moderate + c.low }));
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

  // Repinta la capa de focos cuando cambian los buckets seleccionados o el
  // toggle de no-forestal. WHI-757: focos no-forestales se renderizan con
  // opacidad más baja y sin color de intensidad para no compitir visualmente
  // con los focos forestales (el mensaje del producto es prevención forestal).
  useEffect(() => {
    const group = layerGroups.current.fires;
    if (!group) return;
    group.clearLayers();
    for (const f of allFires.current) {
      const inForest = Boolean(f.forestZone);
      if (!inForest && !showNonForest) continue;
      if (inForest && !intensities.has(frpBucket(f.frp))) continue;

      const radius = Math.max(3, Math.min(8, f.frp / 4));
      if (inForest) {
        const color =
          f.confidence === "h" || f.confidence === "high" ? "#ef4444" : "#f97316";
        L.circleMarker([f.latitude, f.longitude], {
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.7,
          weight: 1,
        }).addTo(group);
      } else {
        // No forestal: gris translúcido, sin border. Se ve pero no domina.
        L.circleMarker([f.latitude, f.longitude], {
          radius: Math.max(2, Math.min(5, f.frp / 6)),
          color: "#8a8a7e",
          fillColor: "#8a8a7e",
          fillOpacity: 0.25,
          weight: 0,
        }).addTo(group);
      }
    }
  }, [intensities, intensityCounts, showNonForest]);

  return (
    <div className="relative w-full" style={{ height: "100%", minHeight: "600px" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      {/* Layer toggles */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-1">
        <LayerToggle
          label="Focos forestales"
          color="#f97316"
          active={layers.fires}
          count={stats.fires}
          onClick={() => setLayers((l) => ({ ...l, fires: !l.fires }))}
        />
        {/* Sub-chips de intensidad — solo aparecen si la capa Focos está activa */}
        {layers.fires && stats.fires > 0 && (
          <div className="flex flex-col gap-1 ml-3 mt-0.5 pl-2 border-l border-border/60">
            {(Object.keys(INTENSITY_META) as Intensity[]).map((key) => {
              const meta = INTENSITY_META[key];
              const count = intensityCounts[key];
              if (count === 0) return null;
              const active = intensities.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleIntensity(key)}
                  title={meta.range}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-[10px] font-mono transition-all bg-surface-2/70 backdrop-blur-sm"
                  style={{
                    color: active ? meta.color : "#8a8a7e80",
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: active ? meta.color : "#333" }}
                  />
                  {meta.label}
                  <span className="text-muted/60 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* WHI-757: toggle "ver no forestal". Solo visible si hay focos
            no-forestales para sumar (i.e. cuando hay actividad agro/industrial
            detectada esa jornada). */}
        {layers.fires && nonForestCount > 0 && (
          <div className="ml-3 mt-0.5 pl-2 border-l border-border/60">
            <button
              onClick={() => setShowNonForest((v) => !v)}
              title="Quemas agrícolas, flaring y otra actividad fuera de zona forestal"
              className="flex items-center gap-2 rounded-md px-2 py-1 text-[10px] font-mono transition-all bg-surface-2/70 backdrop-blur-sm"
              style={{
                color: showNonForest ? "#8a8a7e" : "#8a8a7e80",
                opacity: showNonForest ? 1 : 0.55,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: showNonForest ? "#8a8a7e" : "#333" }}
              />
              + No forestal
              <span className="text-muted/60 tabular-nums">{nonForestCount}</span>
            </button>
          </div>
        )}
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
