"use client";

import { addBasemap } from "@/lib/basemap";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { AIR_LEVEL_COLORS, type AirLevel } from "@/lib/air-quality";
import { showsFire, type CityFireFilter } from "@/lib/city-fires";
import type { ProjectionCollection } from "@/lib/fire-projection";
import { fireProjectionPath } from "@/lib/fire-projection-request";
import { haversineKm } from "@/lib/geo";
import {
  FRONT_LEGEND,
  POSSIBLE_FIRE_LABEL,
  SMOKE_LEGEND,
  VARIABLE_LEGEND,
  frontEtaLabel,
  frontStyle,
  legendFooter,
  projectionIsCurrent,
  windSourceLabel,
} from "@/lib/projection-legend";

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
  /** VIIRS: 0 vegetation, 1 volcano, 2 static land source (industrial flares), 3 offshore. */
  type?: number;
  forestZone?: string;
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

// WHI-907 part 11 — at most this many fires get a smoke/front projection, the
// nearest to the focus (or the city) first: each one costs a wind lookup.
const MAX_PROJECTIONS = 8;
// A focus this close to a listed fire is that fire.
const SAME_FIRE_KM = 1;

interface ProjectionLegendState {
  smoke: boolean;
  front: boolean;
  variable: boolean;
  unavailable: boolean;
  updatedAt: string | null;
  windSource: string | null;
}

type ProjectionResponse = ProjectionCollection & { unavailable?: string };

export function CityMap({
  lat,
  lng,
  cityName,
  focus = null,
  fireFilter = "forest",
}: {
  lat: number;
  lng: number;
  cityName: string;
  /** Fire to center on (Bahía Blanca page, `?foco=`). */
  focus?: { lat: number; lng: number } | null;
  fireFilter?: CityFireFilter;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const [air, setAir] = useState<AirRes | null>(null);
  const [wind, setWind] = useState<WindRes | null>(null);
  const [fireCount, setFireCount] = useState(0);
  const [firesLoaded, setFiresLoaded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [legend, setLegend] = useState<ProjectionLegendState | null>(null);
  const focusLat = focus?.lat;
  const focusLng = focus?.lng;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let disposed = false;
    const focusPoint =
      focusLat != null && focusLng != null ? { lat: focusLat, lng: focusLng } : null;

    const map = L.map(mapRef.current, {
      center: focusPoint ? [focusPoint.lat, focusPoint.lng] : [lat, lng],
      zoom: focusPoint ? 11 : 13,
      zoomControl: false,
      attributionControl: false,
    });

    addBasemap(L, map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapInstance.current = map;

    // Bottom to top: basemap → smoke → fire front → wind arrows (markerPane,
    // 600) → fires → tooltips (650).
    map.createPane("projection-smoke").style.zIndex = "410";
    map.createPane("projection-front").style.zIndex = "420";
    map.createPane("fires").style.zIndex = "640";

    // City center marker
    const cityIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#d2541d;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(40,30,14,0.15),0 0 12px rgba(210,84,29,0.45)"></div>`,
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

    if (focusPoint) {
      const focusIcon = L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;border:2px solid #7c2d12;box-shadow:0 0 0 4px rgba(124,45,18,0.18)"></div>`,
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([focusPoint.lat, focusPoint.lng], {
        icon: focusIcon,
        interactive: false,
        pane: "fires",
      }).addTo(map);
    }

    function drawProjections(nearby: FirePoint[]) {
      const origin = focusPoint ?? { lat, lng };
      const targets = nearby.map((f) => ({
        lat: f.latitude,
        lng: f.longitude,
        confirmed: true,
        forestZone: f.forestZone,
        distanceKm: haversineKm(origin.lat, origin.lng, f.latitude, f.longitude),
      }));
      // A focus from an alert whose fire is no longer listed still shows its
      // smoke, but only as a possible fire: nothing confirms it anymore.
      if (focusPoint && !targets.some((t) => t.distanceKm <= SAME_FIRE_KM)) {
        targets.push({ ...focusPoint, confirmed: false, forestZone: undefined, distanceKm: 0 });
      }
      const chosen = targets
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, MAX_PROJECTIONS);
      if (chosen.length === 0) return;

      Promise.all(
        chosen.map((t) =>
          fetch(fireProjectionPath(t))
            .then((r) => (r.ok ? (r.json() as Promise<ProjectionResponse>) : null))
            .catch(() => null),
        ),
      ).then((collections) => {
        if (disposed) return;
        const now = new Date();
        const state: ProjectionLegendState = {
          smoke: false,
          front: false,
          variable: false,
          unavailable: false,
          updatedAt: null,
          windSource: null,
        };
        const bounds = L.latLngBounds([origin.lat, origin.lng], [origin.lat, origin.lng]);

        collections.forEach((collection, index) => {
          if (!collection) return;
          if (collection.unavailable) {
            state.unavailable = true;
            return;
          }
          const features = collection.features
            .filter((f) => projectionIsCurrent(f.properties.valid_to, now))
            // +3 h first, so +30 min ends up on top.
            .sort((a, b) => (b.properties.eta_minutes ?? 0) - (a.properties.eta_minutes ?? 0));

          for (const feature of features) {
            const p = feature.properties;
            const latlngs = feature.geometry.coordinates[0].map(
              ([pointLng, pointLat]) => [pointLat, pointLng] as [number, number],
            );
            state.updatedAt = p.issued_at;
            state.windSource = p.wind_source;

            if (p.kind === "smoke") {
              const layer = L.polygon(latlngs, {
                pane: "projection-smoke",
                color: "#475569",
                weight: 1,
                dashArray: "4 4",
                fillColor: "#475569",
                fillOpacity: 0.12,
              });
              if (p.possible_fire) layer.bindTooltip(POSSIBLE_FIRE_LABEL, { sticky: true });
              layer.addTo(map);
              bounds.extend(layer.getBounds());
              state.smoke = true;
            } else if (p.kind === "front" && p.eta_minutes != null) {
              const style = frontStyle(p.eta_minutes);
              const layer = L.polygon(latlngs, {
                pane: "projection-front",
                color: style.color,
                weight: 1.5,
                fillColor: style.color,
                fillOpacity: style.fillOpacity,
              });
              // Every line carries its time written out. Permanent only on the
              // nearest fire, so labels do not pile up over each other.
              layer.bindTooltip(frontEtaLabel(p.eta_minutes, p.issued_at), {
                permanent: index === 0,
                direction: "right",
              });
              layer.addTo(map);
              bounds.extend(layer.getBounds());
              state.front = true;
            } else if (p.kind === "variable") {
              const layer = L.polygon(latlngs, {
                pane: "projection-smoke",
                color: "#64748b",
                weight: 1,
                dashArray: "2 6",
                fillColor: "#64748b",
                fillOpacity: 0.06,
              });
              layer.bindTooltip(VARIABLE_LEGEND, { sticky: true });
              layer.addTo(map);
              bounds.extend(layer.getBounds());
              state.variable = true;
            }
          }
        });

        const drew = state.smoke || state.front || state.variable;
        // Zoom out to the shapes only when following a fire from an alert: on
        // a plain city page the city view (air quality, wind) stays in focus.
        if (drew && focusPoint) map.fitBounds(bounds.pad(0.1), { maxZoom: 12 });
        if (drew || state.unavailable) setLegend(state);
      });
    }

    // Load fires layer
    fetch("/api/fires")
      .then((r) => r.json())
      .then((data) => {
        if (disposed) return;
        const fires: FirePoint[] = data.fires || [];
        // Fires within a real 100 km radius — aligns with CityForestFires.
        const nearby = fires.filter(
          (f) =>
            showsFire(f, fireFilter) &&
            haversineKm(lat, lng, f.latitude, f.longitude) <= 100,
        );
        nearby.forEach((f) => {
          const color =
            f.confidence === "h" || f.confidence === "high"
              ? "#ef4444"
              : "#f97316";
          L.circleMarker([f.latitude, f.longitude], {
            pane: "fires",
            radius: Math.max(4, Math.min(8, f.frp / 4)),
            color,
            fillColor: color,
            fillOpacity: 0.7,
            weight: 1,
          }).addTo(map);
        });
        setFireCount(nearby.length);
        setFiresLoaded(true);
        drawProjections(nearby);
      })
      .catch(() => {});

    // Load air quality
    fetch(`/api/air-quality?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        if (disposed) return;
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
        if (disposed) return;
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
      disposed = true;
      map.remove();
      mapInstance.current = null;
    };
  }, [lat, lng, cityName, focusLat, focusLng, fireFilter]);

  const vegetation = fireFilter === "vegetation";

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Data panel — left side, SatAI style */}
      <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-2 w-64 max-h-[calc(100%-24px)] overflow-y-auto">
        {/* Citizen summary */}
        <CollapsibleCard title="Resumen ciudadano" accent="#d2541d">
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

        {/* Where the fire and its smoke are heading (WHI-907 part 11) */}
        {legend && (
          <CollapsibleCard title="Hacia dónde va" accent="#7c2d12">
            <div className="space-y-2">
              {legend.smoke && (
                <LegendRow
                  swatch={
                    <span
                      className="block w-4 h-3 rounded-sm"
                      style={{ border: "1px dashed #475569", background: "rgba(71,85,105,0.12)" }}
                    />
                  }
                  text={SMOKE_LEGEND}
                />
              )}
              {legend.front && (
                <LegendRow
                  swatch={
                    <span
                      className="block w-4 h-3 rounded-sm"
                      style={{
                        border: "1px solid #c2410c",
                        background: "linear-gradient(90deg, rgba(124,45,18,0.45), rgba(253,186,116,0.35))",
                      }}
                    />
                  }
                  text={FRONT_LEGEND}
                />
              )}
              {legend.variable && (
                <LegendRow
                  swatch={
                    <span
                      className="block w-3 h-3 rounded-full"
                      style={{ border: "1px dashed #64748b", background: "rgba(100,116,139,0.06)" }}
                    />
                  }
                  text={VARIABLE_LEGEND}
                />
              )}
              {legend.unavailable && (
                <p className="text-xs text-muted leading-relaxed">
                  Sin datos de viento confiables ahora: no dibujamos hacia dónde va.
                </p>
              )}
              {legend.windSource && (
                <p className="font-mono text-[10px] text-muted">
                  Viento: {windSourceLabel(legend.windSource)}
                </p>
              )}
              {legend.updatedAt && (
                <p className="text-[10px] text-muted leading-relaxed">
                  {legendFooter(legend.updatedAt)}
                </p>
              )}
            </div>
          </CollapsibleCard>
        )}

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
                      <span className="text-muted">{val.unit}</span>
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
        {firesLoaded && (
          <CollapsibleCard
            title={vegetation ? "Focos activos" : "Focos forestales"}
            accent={fireCount > 0 ? "#f97316" : undefined}
          >
            {fireCount > 0 ? (
              <p className="text-xs text-muted">
                {vegetation
                  ? `${fireCount} foco(s) en un radio de 100 km.`
                  : `${fireCount} foco(s) forestal(es) en un radio de 100 km.`}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "var(--good)" }}>
                {vegetation
                  ? "Sin focos en un radio de 100 km."
                  : "Sin focos forestales en un radio de 100 km."}
              </p>
            )}
          </CollapsibleCard>
        )}
      </div>
    </div>
  );
}

function LegendRow({ swatch, text }: { swatch: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{swatch}</span>
      <span className="text-xs text-foreground/70 leading-snug">{text}</span>
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

  // shrink-0: inside the scrolling panel a card keeps its full height instead
  // of being squeezed and cutting its text — the projection legend's "es una
  // estimación" footer has to stay readable.
  return (
    <div className="shrink-0 rounded-xl border border-border bg-background/90 backdrop-blur-sm overflow-hidden">
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
