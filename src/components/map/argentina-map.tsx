"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PROVINCES } from "@/lib/argentina-cities";
import { AIR_LEVEL_COLORS, type AirLevel } from "@/lib/air-quality";
import { forestZoneName } from "@/lib/forest-zones";
import {
  computeGroundTrack,
  currentSubSatellitePoint,
  type SatelliteTLE,
} from "@/lib/satellites";

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
  satellites: boolean;
}

// WHI-754 — color por satélite VIIRS. Tonos azules para que la familia se lea
// como "una sola cosa" pero distinguibles entre sí.
const SATELLITE_META: Record<number, { label: string; color: string }> = {
  37849: { label: "Suomi NPP", color: "#4b8bd4" },
  43013: { label: "NOAA-20", color: "#5fb3c7" },
  54234: { label: "NOAA-21", color: "#7ed3e8" },
};

const MARKER_REFRESH_MS = 5_000;

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

/** Etiqueta legible de confianza VIIRS (l/n/h) para la lista de focos. */
function confLabel(c: string): string {
  if (c === "h" || c === "high") return "conf. alta";
  if (c === "l" || c === "low") return "conf. baja";
  return "conf. media";
}

/** "actualizado hace X" a partir del timestamp ISO de /api/fires. */
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 90) return "hace instantes";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

// Íconos de capa (line-art, heredan currentColor del botón .clp-layer).
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const FireIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3c1 3 4 5 4 9a4 4 0 1 1-8 0c0-2 1-3 2-4-1 2 0 3 1 3s1-2 1-4c0-2 0-3 0-4z" />
  </svg>
);
const AirIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z" />
  </svg>
);
const WindIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M3 8h10a3 3 0 1 0-3-3" />
    <path d="M3 12h16a3 3 0 1 1-3 3" />
    <path d="M3 16h7" />
  </svg>
);
const SatIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
  </svg>
);
const LayersIcon = () => (
  <svg {...ICON_PROPS} width="14" height="14">
    <path d="m12 2 9 5-9 5-9-5 9-5z" />
    <path d="m3 12 9 5 9-5" />
  </svg>
);

export function ArgentinaMap({ tles = [] }: { tles?: SatelliteTLE[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerGroups = useRef<Record<string, L.LayerGroup>>({});
  // Markers por satélite, separados del polyline group para poder reposicionar
  // sin re-trazar la trayectoria entera cada 5s. Usamos L.Marker con divIcon
  // (emoji 🛰) en lugar de circleMarker para mantener consistencia visual
  // con el hero.
  const satelliteMarkers = useRef<Map<number, L.Marker>>(new Map());
  // Fires se renderizan por intensidad — los guardamos crudos en memoria
  // para repintar al cambiar filtros sin re-fetchear /api/fires.
  const allFires = useRef<FirePoint[]>([]);
  const [layers, setLayers] = useState<LayerState>({
    fires: true,
    air: true,
    wind: false,
    // WHI-754 follow-up: capa de satélites activa por default. Los TLEs
    // que llegan como prop ya están filtrados a los frescos, así que el
    // costo de render inicial es predecible (3 sats × ~360 puntos).
    satellites: true,
  });
  const [selectedSats, setSelectedSats] = useState<Set<number>>(
    () => new Set(tles.map((t) => t.norad_id))
  );
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
  // M13 — explicit "fires loaded" signal for the repaint effect. Bumped once
  // fires land in allFires.current, so the layer repaints even when there are
  // zero forest fires (where intensityCounts wouldn't change from its initial).
  const [firesVersion, setFiresVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ fires: 0, cities: 0 });
  // Datos para el side panel del diseño: lista de focos forestales recientes
  // (ordenados por FRP) + timestamp de actualización del cache FIRMS.
  const [recentFires, setRecentFires] = useState<FirePoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  // Drawer del panel en mobile (en desktop el panel es estático, ver globals.css).
  const [panelOpen, setPanelOpen] = useState(false);

  const toggleIntensity = useCallback((key: Intensity) => {
    setIntensities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSat = useCallback((noradId: number) => {
    setSelectedSats((prev) => {
      const next = new Set(prev);
      if (next.has(noradId)) next.delete(noradId);
      else next.add(noradId);
      return next;
    });
  }, []);

  // TLEs frescos (<7 días) con metadata. Filtra acá una sola vez en vez de
  // dentro de cada useEffect.
  const renderableTles = useMemo(
    () => tles.filter((t) => t.line1 && t.line2 && SATELLITE_META[t.norad_id]),
    [tles]
  );

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      center: [-38, -64],
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
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
    layerGroups.current.satellites = L.layerGroup();

    // Load all data
    loadFires();
    loadAirQuality(layerGroups.current.air);
    loadWind(layerGroups.current.wind);

    async function loadFires() {
      try {
        const data = await fetch("/api/fires").then((r) => r.json());
        const fires: FirePoint[] = data.fires || [];
        allFires.current = fires;
        setFiresVersion((v) => v + 1);
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
        // Panel: top focos forestales por FRP para la lista "Focos recientes".
        setRecentFires(
          fires
            .filter((f) => f.forestZone)
            .sort((a, b) => b.frp - a.frp)
            .slice(0, 14),
        );
        setUpdatedAt(typeof data.updated === "string" ? data.updated : null);
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

  // WHI-754 — repinta ground tracks cuando cambia la selección de satélites o
  // cuando la capa se activa por primera vez. Cada track son 360 puntos (3h @
  // 30s), segmentados en el cruce del antimeridiano. Las polylines + markers
  // se borran enteros y se redibujan — más simple que diffear y a esa escala
  // (< 4 sats × < 10 segmentos) imperceptible.
  useEffect(() => {
    const group = layerGroups.current.satellites;
    if (!group || !layers.satellites) {
      satelliteMarkers.current.clear();
      group?.clearLayers();
      return;
    }
    group.clearLayers();
    satelliteMarkers.current.clear();
    const now = new Date();

    for (const tle of renderableTles) {
      if (!selectedSats.has(tle.norad_id)) continue;
      const meta = SATELLITE_META[tle.norad_id];
      const segments = computeGroundTrack(tle, 3 * 60 * 60_000, 30_000, now);
      if (!segments) continue;

      for (const seg of segments) {
        if (seg.length < 2) continue;
        L.polyline(
          seg.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: meta.color,
            weight: 1.5,
            opacity: 0.7,
            dashArray: "4 6",
          }
        ).addTo(group);
      }

      const ssp = currentSubSatellitePoint(tle, now);
      if (ssp) {
        const marker = L.marker([ssp.lat, ssp.lng], {
          icon: L.divIcon({
            html: `<span style="font-size:18px;line-height:1;filter:drop-shadow(0 0 5px ${meta.color})">🛰</span>`,
            className: "",
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        });
        marker.bindTooltip(
          `<b>${meta.label}</b><br/>NORAD ${tle.norad_id}<br/>` +
            `<a href="https://www.n2yo.com/passes/?s=${tle.norad_id}" target="_blank" rel="noopener noreferrer">próximos pases (n2yo)</a>`,
          { direction: "top" }
        );
        marker.addTo(group);
        satelliteMarkers.current.set(tle.norad_id, marker);
      }
    }
  }, [layers.satellites, selectedSats, renderableTles]);

  // WHI-754 — reposiciona los markers de satélites cada 5s sin re-trazar las
  // polylines. La trayectoria 3h forward no cambia perceptiblemente entre
  // ticks; solo la posición del satélite "ahora" se mueve.
  useEffect(() => {
    if (!layers.satellites) return;
    const interval = setInterval(() => {
      const now = new Date();
      for (const tle of renderableTles) {
        if (!selectedSats.has(tle.norad_id)) continue;
        const marker = satelliteMarkers.current.get(tle.norad_id);
        if (!marker) continue;
        const ssp = currentSubSatellitePoint(tle, now);
        if (ssp) marker.setLatLng([ssp.lat, ssp.lng]);
      }
    }, MARKER_REFRESH_MS);
    return () => clearInterval(interval);
  }, [layers.satellites, selectedSats, renderableTles]);

  // WHI-757: repinta la capa de focos cuando cambian los buckets seleccionados
  // o el toggle de no-forestal. Focos no-forestales se renderizan con opacidad
  // más baja y sin color de intensidad para no competir visualmente con los
  // forestales (el mensaje del producto es prevención forestal).
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
  }, [intensities, showNonForest, firesVersion]);

  return (
    <div className="clara-map-shell">
      {/* Backdrop del drawer (solo mobile) */}
      <div
        className={`clara-map-backdrop ${panelOpen ? "is-open" : ""}`}
        onClick={() => setPanelOpen(false)}
        aria-hidden
      />

      {/* ===== SIDE PANEL (design handoff · .clp-) ===== */}
      <aside className={`clp-panel clara-map-panel ${panelOpen ? "is-open" : ""}`}>
        {/* Cabecera */}
        <div className="clp-block">
          <span className="clp-pill">
            <span className="clp-beacon" /> Mapa nacional
          </span>
          <h2 className="clp-title">Argentina en vivo</h2>
          <p className="clp-sub">
            {stats.fires} focos · {stats.cities} ciudades
            {updatedAt ? ` · actualizado ${timeAgo(updatedAt)}` : ""}
          </p>
        </div>

        {/* Selector de capas */}
        <div className="clp-block">
          <div className="clp-label">Capas</div>

          {/* Focos */}
          <button
            className={`clp-layer ${layers.fires ? "is-active" : ""}`}
            onClick={() => setLayers((l) => ({ ...l, fires: !l.fires }))}
          >
            <span className="clp-layer-l">
              <FireIcon /> Focos forestales
            </span>
            <span className="clp-layer-c">{stats.fires}</span>
          </button>
          {/* Sub-chips de intensidad */}
          {layers.fires && stats.fires > 0 && (
            <div className="clp-sub-group">
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
                    className="clp-chip"
                    style={{
                      color: active ? meta.color : "var(--muted)",
                      opacity: active ? 1 : 0.6,
                    }}
                  >
                    <span
                      className="clp-chip-dot"
                      style={{ background: active ? meta.color : "var(--border)" }}
                    />
                    {meta.label}
                    <span className="clp-chip-c">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {/* WHI-757: toggle "ver no forestal" */}
          {layers.fires && nonForestCount > 0 && (
            <div className="clp-sub-group">
              <button
                onClick={() => setShowNonForest((v) => !v)}
                title="Quemas agrícolas, flaring y otra actividad fuera de zona forestal"
                className="clp-chip"
                style={{
                  color: showNonForest ? "#8a8a7e" : "var(--muted)",
                  opacity: showNonForest ? 1 : 0.6,
                }}
              >
                <span
                  className="clp-chip-dot"
                  style={{ background: showNonForest ? "#8a8a7e" : "var(--border)" }}
                />
                + No forestal
                <span className="clp-chip-c">{nonForestCount}</span>
              </button>
            </div>
          )}

          {/* Aire */}
          <button
            className={`clp-layer ${layers.air ? "is-active" : ""}`}
            onClick={() => setLayers((l) => ({ ...l, air: !l.air }))}
          >
            <span className="clp-layer-l">
              <AirIcon /> Calidad del aire
            </span>
            <span className="clp-layer-c">{stats.cities}</span>
          </button>

          {/* Viento */}
          <button
            className={`clp-layer ${layers.wind ? "is-active" : ""}`}
            onClick={() => setLayers((l) => ({ ...l, wind: !l.wind }))}
          >
            <span className="clp-layer-l">
              <WindIcon /> Viento
            </span>
            <span className="clp-layer-c">atmósfera</span>
          </button>

          {/* Satélites */}
          {renderableTles.length > 0 && (
            <>
              <button
                className={`clp-layer ${layers.satellites ? "is-active" : ""}`}
                onClick={() =>
                  setLayers((l) => ({ ...l, satellites: !l.satellites }))
                }
              >
                <span className="clp-layer-l">
                  <SatIcon /> Satélites
                </span>
                <span className="clp-layer-c">{renderableTles.length}</span>
              </button>
              {layers.satellites && (
                <div className="clp-sub-group">
                  {renderableTles.map((tle) => {
                    const meta = SATELLITE_META[tle.norad_id];
                    const active = selectedSats.has(tle.norad_id);
                    return (
                      <button
                        key={tle.norad_id}
                        onClick={() => toggleSat(tle.norad_id)}
                        title={`NORAD ${tle.norad_id} · ground track 3h forward`}
                        className="clp-chip"
                        style={{
                          color: active ? meta.color : "var(--muted)",
                          opacity: active ? 1 : 0.6,
                        }}
                      >
                        <span
                          className="clp-chip-dot"
                          style={{
                            background: active ? meta.color : "var(--border)",
                          }}
                        />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Focos recientes */}
        <div className="clp-block clp-block--scroll">
          <div className="clp-label">Focos forestales recientes</div>
          {recentFires.length === 0 ? (
            <p className="clp-empty">
              {loading
                ? "Cargando focos…"
                : "Sin focos forestales activos ahora mismo."}
            </p>
          ) : (
            recentFires.map((f, i) => (
              <div className="clp-fire" key={`${f.latitude}-${f.longitude}-${i}`}>
                <div>
                  <div className="clp-fire-region">
                    {forestZoneName(f.forestZone) ?? "Zona forestal"}
                  </div>
                  <div className="clp-fire-meta">
                    FRP {f.frp.toFixed(1)} MW · {confLabel(f.confidence)}
                  </div>
                </div>
                <span
                  className="clp-fire-dot"
                  style={{ opacity: Math.min(1, Math.max(0.4, f.frp / 40)) }}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="clp-foot">
          Datos: NASA FIRMS VIIRS · NOAA GOES-19
          <br />
          Cadencia: 15 min · Resolución: 375 m
        </div>
      </aside>

      {/* ===== LIENZO DEL MAPA ===== */}
      <div className="clara-map-canvas">
        <div
          ref={mapRef}
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        />

        {/* Botón para abrir el panel como drawer (solo mobile) */}
        <button
          className="clara-map-drawer-btn absolute top-4 left-4 z-[1000] items-center gap-2 rounded-lg px-3 py-2 font-mono text-[11px]"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            boxShadow: "var(--shadow-panel)",
          }}
          onClick={() => setPanelOpen(true)}
        >
          <LayersIcon /> Capas
        </button>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[999]">
            <span className="font-mono text-xs text-muted animate-pulse">
              Cargando datos...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
