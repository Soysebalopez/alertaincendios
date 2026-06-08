"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  computeGroundTrack,
  currentSubSatellitePoint,
  type SatelliteTLE,
} from "@/lib/satellites";

// WHI-754 hero: tonos azules diferenciados por sat (alineado con /mapa).
const SATELLITE_META: Record<number, { color: string }> = {
  37849: { color: "#4b8bd4" }, // Suomi NPP
  43013: { color: "#5fb3c7" }, // NOAA-20
  54234: { color: "#7ed3e8" }, // NOAA-21
};

// 90 min forward — más corto que /mapa (3h). El mini-mapa del hero se ve más
// limpio sin tantos pasajes que cruzan toda la pantalla.
const HERO_TRACK_DURATION_MS = 90 * 60_000;

interface FirePoint {
  latitude: number;
  longitude: number;
  confidence: string;
  frp: number;
  acqDate: string;
  acqTime: string;
  type?: number;
  /** WHI-757: tag de zona forestal calculado server-side. */
  forestZone?: string;
}

/* ─── Filter definitions ─── */

type FireType = 0 | 1 | 2 | 3;
type Intensity = "high" | "moderate" | "low";

/**
 * Tres niveles de intensidad coordinados con el hero de portada:
 *  - high     → FRP ≥ 20 MW (Alta + Muy alta del popup)
 *  - moderate → 5 ≤ FRP < 20 MW (Moderada)
 *  - low      → FRP < 5 MW (Baja + Muy baja)
 * Solo aplica a wildfires (type 0/1) — flaring industrial no tiene gradiente útil.
 */
const INTENSITY_FILTERS: {
  key: Intensity;
  label: string;
  color: string;
  range: string;
}[] = [
  { key: "high", label: "Alta intensidad", color: "#dc2626", range: "≥ 20 MW" },
  { key: "moderate", label: "Moderada", color: "#ef4444", range: "5–20 MW" },
  { key: "low", label: "Baja", color: "#f97316", range: "< 5 MW" },
];

/**
 * Leyenda con las cinco bandas reales de marker (alineadas con `frpLevel`).
 * Distinta del bucket de filtro (3 niveles) porque acá comunicamos el
 * color exacto que se ve en el mapa, no el grupo bajo el que se filtra.
 * Orden: de menor a mayor intensidad — así se lee como una escala.
 */
const INTENSITY_LEGEND: {
  color: string;
  label: string;
  range: string;
  meaning: string;
}[] = [
  {
    color: "#facc15",
    label: "Muy baja",
    range: "< 1 MW",
    meaning: "quema menor o actividad industrial (flaring)",
  },
  {
    color: "#f97316",
    label: "Baja",
    range: "1–5 MW",
    meaning: "probable quema agrícola controlada o foco incipiente",
  },
  {
    color: "#ef4444",
    label: "Moderada",
    range: "5–20 MW",
    meaning: "incendio activo en desarrollo",
  },
  {
    color: "#dc2626",
    label: "Alta",
    range: "20–50 MW",
    meaning: "incendio forestal significativo",
  },
  {
    color: "#991b1b",
    label: "Muy alta",
    range: "≥ 50 MW",
    meaning: "incendio de gran magnitud",
  },
];

function frpBucket(frp: number): Intensity {
  if (frp >= 20) return "high";
  if (frp >= 5) return "moderate";
  return "low";
}

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
       style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#d2541d;text-decoration:none;font-weight:500">
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

/**
 * Mini-mapa del hero. Recibe los focos por prop desde el SSR del hero, así
 * el contador y los puntos del mapa SIEMPRE muestran el mismo snapshot. Antes
 * el componente hacía su propio fetch a /api/fires, lo que abría una ventana
 * de inconsistencia (SSR fetch a T → cliente fetch a T+200ms; pg_cron pudo
 * haber actualizado fires_cache en el medio) y peor, el filtro forestal del
 * pivote WHI-757 quedó solo aplicado al hero counter — el mini-mapa seguía
 * mostrando todos los focos.
 *
 * Mantiene paridad con /mapa: por default muestra solo focos forestales,
 * con toggle "+ no forestal" para sumar quemas agrícolas/flaring (gris
 * translúcido).
 */
export function FireMap({
  tles = [],
  fires = [],
}: {
  tles?: SatelliteTLE[];
  fires?: FirePoint[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  // Una sola capa para todos los markers visibles. En cada cambio de filtro
  // la vaciamos y la rellenamos con lo que matchea — para los volúmenes que
  // maneja FIRMS sobre Argentina (≤ 500 puntos) es instantáneo y mantiene
  // el state model trivial.
  const markersLayer = useRef<L.LayerGroup | null>(null);
  // WHI-754 hero: capa dedicada a polylines de ground tracks satelitales.
  // Renderiza una sola vez con los TLEs disponibles — no hay refresh ni
  // marker animado en el hero (eso vive en /mapa, donde el contexto es más
  // pesado y el usuario está en modo exploración).
  const satellitesLayer = useRef<L.LayerGroup | null>(null);
  const renderableTles = useMemo(
    () => tles.filter((t) => t.line1 && t.line2 && SATELLITE_META[t.norad_id]),
    [tles]
  );
  const [activeIntensities, setActiveIntensities] = useState<Set<Intensity>>(
    new Set(["high", "moderate", "low"])
  );
  // WHI-757: paridad con /mapa — por default solo forestal. El usuario puede
  // sumar no-forestal con un toggle si quiere ver actividad agrícola/flaring.
  const [showNonForest, setShowNonForest] = useState(false);

  // Conteos derivados del snapshot SSR. Memoized para no recalcular en cada
  // render de filtros.
  const counts = useMemo(() => {
    const byIntensity: Record<Intensity, number> = { high: 0, moderate: 0, low: 0 };
    let nonForestWild = 0;
    let industrial = 0;
    for (const f of fires) {
      const t = (f.type ?? 0) as FireType;
      const isWild = t === 0 || t === 1;
      if (!isWild) {
        industrial++;
        continue;
      }
      if (!f.forestZone) {
        nonForestWild++;
        continue;
      }
      byIntensity[frpBucket(f.frp)]++;
    }
    const forestTotal = byIntensity.high + byIntensity.moderate + byIntensity.low;
    return { byIntensity, forestTotal, nonForestWild, industrial };
  }, [fires]);

  // Re-renderiza markers cada vez que cambian los filtros activos o
  // cuando entran los datos. Itera sobre la lista cruda en memoria
  // (no vuelve a llamar a /api/fires).
  const renderMarkers = useCallback(() => {
    const layer = markersLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const f of fires) {
      const t = (f.type ?? 0) as FireType;
      const isWild = t === 0 || t === 1;
      const inForest = Boolean(f.forestZone);
      // WHI-757 paridad con hero counter:
      //  - wildfire forestal       → siempre se ve (sujeto a chip intensidad)
      //  - wildfire no forestal    → solo si toggle "+ no forestal" está on
      //  - industrial (flaring/offshore/volcano) → solo si toggle on
      if (!isWild && !showNonForest) continue;
      if (isWild && !inForest && !showNonForest) continue;
      if (isWild && inForest && !activeIntensities.has(frpBucket(f.frp))) continue;
      createFireMarker(f).addTo(layer);
    }
  }, [fires, activeIntensities, showNonForest]);

  const toggleIntensity = useCallback((key: Intensity) => {
    setActiveIntensities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Inicialización del mapa. Solo corre una vez (no fetch — los focos vienen
  // por prop desde el SSR del hero).
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
      { maxZoom: 18 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const layer = L.layerGroup().addTo(map);
    markersLayer.current = layer;
    // WHI-754 hero: capa de ground tracks debajo de los markers para que los
    // focos siempre queden visibles encima de las líneas satelitales.
    const satLayer = L.layerGroup().addTo(map);
    satellitesLayer.current = satLayer;
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      markersLayer.current = null;
      satellitesLayer.current = null;
    };
  }, []);

  // WHI-754 hero: dibuja ground tracks + marker 🛰 en la posición actual de
  // cada satélite. Render una sola vez al montar (no hay refresh animado en
  // el hero — todo lo dinámico vive en /mapa).
  useEffect(() => {
    const layer = satellitesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (renderableTles.length === 0) return;
    const now = new Date();
    for (const tle of renderableTles) {
      const meta = SATELLITE_META[tle.norad_id];
      const segments = computeGroundTrack(tle, HERO_TRACK_DURATION_MS, 30_000, now);
      if (!segments) continue;
      for (const seg of segments) {
        if (seg.length < 2) continue;
        L.polyline(
          seg.map((p) => [p.lat, p.lng] as [number, number]),
          {
            color: meta.color,
            weight: 1.2,
            opacity: 0.5,
            dashArray: "3 5",
            interactive: false,
          }
        ).addTo(layer);
      }

      // Marker emoji 🛰 en la posición actual del satélite. divIcon en lugar
      // de circleMarker porque queremos el glyph del satélite, no un punto.
      const ssp = currentSubSatellitePoint(tle, now);
      if (ssp) {
        L.marker([ssp.lat, ssp.lng], {
          icon: L.divIcon({
            html: `<span style="font-size:16px;line-height:1;filter:drop-shadow(0 0 4px ${meta.color})">🛰</span>`,
            className: "",
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          interactive: false,
        }).addTo(layer);
      }
    }
  }, [renderableTles]);

  // Repinta cuando cambian filtros, toggle no-forestal o entran focos nuevos
  // (cada vez que el SSR pasa una prop nueva por router.refresh()).
  useEffect(() => {
    renderMarkers();
  }, [renderMarkers]);

  const nonForestTotal = counts.nonForestWild + counts.industrial;

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />

      {/* Filtros: paridad con /mapa — intensidad + toggle no-forestal. El total
          forestal del hero matchea exactamente la suma de chips activos. */}
      {counts.forestTotal > 0 && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2 z-[1000]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] text-muted tracking-[0.15em] uppercase pr-1 select-none">
              Forestal
            </span>
            {INTENSITY_FILTERS.map((f) => {
              const count = counts.byIntensity[f.key] || 0;
              if (count === 0) return null;
              const isActive = activeIntensities.has(f.key);
              return (
                <button
                  key={f.key}
                  onClick={() => toggleIntensity(f.key)}
                  title={`${f.label} · ${f.range}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono transition-all duration-200 border select-none cursor-pointer"
                  style={{
                    background: isActive ? `${f.color}18` : "#ffffffcc",
                    borderColor: isActive ? `${f.color}55` : "#e2ddd0cc",
                    color: isActive ? f.color : "#76705f",
                    opacity: isActive ? 1 : 0.75,
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  <span>{f.label}</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: isActive ? f.color : "#76705f99" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            {nonForestTotal > 0 && (
              <button
                onClick={() => setShowNonForest((v) => !v)}
                title="Quemas agrícolas, flaring y otra actividad fuera de zona forestal"
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono transition-all duration-200 border select-none cursor-pointer"
                style={{
                  background: showNonForest ? "#8a8a7e22" : "#ffffffcc",
                  borderColor: showNonForest ? "#8a8a7e80" : "#e2ddd0cc",
                  color: showNonForest ? "#1b1a15" : "#76705f",
                  opacity: showNonForest ? 1 : 0.75,
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                }}
              >
                <span>+ No forestal</span>
                <span className="font-semibold tabular-nums">{nonForestTotal}</span>
              </button>
            )}
          </div>
          {/* Leyenda: una fila por color real de marker (5 bandas FRP). */}
          <div
            className="flex flex-col gap-1 rounded-lg px-3 py-2 font-mono text-[10px] leading-tight select-none"
            style={{
              background: "#ffffffcc",
              border: "1px solid #e2ddd0cc",
              color: "#76705f",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          >
            {INTENSITY_LEGEND.map((l) => (
              <span
                key={l.label}
                className="inline-flex items-baseline gap-1.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0 self-center"
                  style={{ background: l.color }}
                />
                <span style={{ color: "#d4d4cc" }}>{l.label}</span>
                <span style={{ color: "#8a8a7e80" }}>({l.range}):</span>{" "}
                <span>{l.meaning}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
