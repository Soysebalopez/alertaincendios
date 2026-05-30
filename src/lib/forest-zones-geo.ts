import "server-only";

import { FOREST_ZONES, type ForestZone } from "./forest-zones";

import andinoPatagonico from "./forest-polygons/andino-patagonico.json";
import yungas from "./forest-polygons/yungas.json";
import selvaMisionera from "./forest-polygons/selva-misionera.json";
import espinalMesopotamico from "./forest-polygons/espinal-mesopotamico.json";
import sierrasCordoba from "./forest-polygons/sierras-cordoba.json";
import chacoNorte from "./forest-polygons/chaco-norte.json";
import tierraDelFuego from "./forest-polygons/tierra-del-fuego.json";

/**
 * Polígonos forestales argentinos derivados de MapBiomas Colección 2 (2024),
 * clase "Formación Forestal". Server-only para mantener el bundle del cliente
 * chico (los 6 polígonos pesan ~170 KB combined).
 *
 * Pipeline de generación:
 *   gdal_translate -projwin → crop por zona
 *   gdal_calc.py "A==3"     → forest mask binaria
 *   gdalwarp -tr 0.005      → downsample a ~500m (precisión binaria suficiente)
 *   gdal_polygonize.py      → raster → vector polygons
 *   mapshaper -filter-islands min-area=20km2 -dissolve -simplify dp 2%
 *   precision rounding 3 decimales (~111m)
 *
 * Cada JSON es un array de polígonos: `Polygon[][]` donde Polygon = ring de
 * [lng, lat] coords. Equivale al `MultiPolygon.coordinates` de GeoJSON.
 *
 * IDs estables: mismos que la versión hand-drawn (WHI-757) para que los
 * tags `forestZone` en fires_cache sigan siendo válidos sin migración.
 */
type Polygon = Array<[number, number]>; // ring (sin holes en este dataset)
type MultiPolygon = Array<Array<Polygon>>; // un poly = array de rings; multi = array de polys

const POLYGONS: Record<string, MultiPolygon> = {
  "andino-patagonico": andinoPatagonico as MultiPolygon,
  yungas: yungas as MultiPolygon,
  "selva-misionera": selvaMisionera as MultiPolygon,
  "espinal-mesopotamico": espinalMesopotamico as MultiPolygon,
  "sierras-cordoba": sierrasCordoba as MultiPolygon,
  "chaco-norte": chacoNorte as MultiPolygon,
  "tierra-del-fuego": tierraDelFuego as MultiPolygon,
};

// Bounding boxes pre-computados por zona para fast-reject. Si el punto cae
// afuera del bbox + buffer, no vale la pena chequear cada polygon. Reduce
// el costo medio del ~80% de los focos (que caen lejos de cualquier zona).
type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };
const BBOXES: Record<string, BBox> = (() => {
  const out: Record<string, BBox> = {};
  for (const [id, mp] of Object.entries(POLYGONS)) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const poly of mp) for (const ring of poly) for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    out[id] = { minLng, minLat, maxLng, maxLat };
  }
  return out;
})();

// WHI-760: buffer WUI alrededor de zonas forestales (en grados ≈ km).
// 5 km a la latitud media de Argentina ≈ 0.045°. Lo usamos solo para el
// fast-reject por bbox; la distancia real se calcula con haversine.
export const FOREST_BUFFER_KM = 5;
const BBOX_BUFFER_DEG = 0.05;

/* ─── Geometría ─── */

function pointInRing(lng: number, lat: number, ring: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(lng: number, lat: number, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (!poly.length) continue;
    // Convención GeoJSON: ring[0] es exterior, ring[1..] son holes.
    if (!pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(lng, lat, poly[i])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

const EARTH_R_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

function bearingRad(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

function pointToSegmentDistanceKm(
  lat: number,
  lng: number,
  sLat: number,
  sLng: number,
  eLat: number,
  eLng: number
): number {
  const δ13 = haversineKm(sLat, sLng, lat, lng) / EARTH_R_KM;
  if (δ13 === 0) return 0;
  const θ13 = bearingRad(sLat, sLng, lat, lng);
  const θ12 = bearingRad(sLat, sLng, eLat, eLng);
  const dxt = Math.asin(Math.sin(δ13) * Math.sin(θ13 - θ12)) * EARTH_R_KM;
  const dat = Math.acos(Math.cos(δ13) / Math.cos(dxt / EARTH_R_KM)) * EARTH_R_KM;
  const segLength = haversineKm(sLat, sLng, eLat, eLng);
  if (Number.isNaN(dat) || dat < 0) return haversineKm(lat, lng, sLat, sLng);
  if (dat > segLength) return haversineKm(lat, lng, eLat, eLng);
  return Math.abs(dxt);
}

function minDistanceKmToMultiPolygon(
  lat: number,
  lng: number,
  mp: MultiPolygon
): number {
  let min = Infinity;
  for (const poly of mp) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [sLng, sLat] = ring[j];
        const [eLng, eLat] = ring[i];
        const d = pointToSegmentDistanceKm(lat, lng, sLat, sLng, eLat, eLng);
        if (d < min) {
          min = d;
          // Early exit: si ya estamos adentro del buffer, no vale la pena
          // seguir iterando los miles de segments restantes.
          if (min < 0.001) return min;
        }
      }
    }
  }
  return min;
}

/* ─── Public API ─── */

/**
 * Clasifica un punto (lat, lng) como dentro/fuera de las zonas forestales
 * argentinas. Devuelve la zona si match (incluido buffer WUI de
 * FOREST_BUFFER_KM), o null si está fuera de todas.
 *
 * Estrategia:
 * 1. Fast reject por bounding box + buffer. ~80% de focos en Argentina
 *    caen lejos de cualquier zona forestal y terminan acá.
 * 2. Para zonas que pasan el bbox check, point-in-multipolygon.
 * 3. Si el punto no cae adentro de ningún polygon, calcular distancia
 *    mínima al borde y devolver la zona si está dentro del buffer.
 */
export function findForestZone(lat: number, lng: number): ForestZone | null {
  // Fast path: punto adentro de algún polígono (post bbox filter).
  for (const zone of FOREST_ZONES) {
    const bbox = BBOXES[zone.id];
    if (!bbox) continue;
    if (
      lng < bbox.minLng ||
      lng > bbox.maxLng ||
      lat < bbox.minLat ||
      lat > bbox.maxLat
    ) {
      continue;
    }
    if (pointInMultiPolygon(lng, lat, POLYGONS[zone.id])) return zone;
  }
  // Slow path: punto cerca del borde de algún polígono (WUI buffer).
  let bestZone: ForestZone | null = null;
  let bestDistance = FOREST_BUFFER_KM;
  for (const zone of FOREST_ZONES) {
    const bbox = BBOXES[zone.id];
    if (!bbox) continue;
    if (
      lng < bbox.minLng - BBOX_BUFFER_DEG ||
      lng > bbox.maxLng + BBOX_BUFFER_DEG ||
      lat < bbox.minLat - BBOX_BUFFER_DEG ||
      lat > bbox.maxLat + BBOX_BUFFER_DEG
    ) {
      continue;
    }
    const d = minDistanceKmToMultiPolygon(lat, lng, POLYGONS[zone.id]);
    if (d < bestDistance) {
      bestDistance = d;
      bestZone = zone;
    }
  }
  return bestZone;
}

export function isInForestZone(lat: number, lng: number): boolean {
  return findForestZone(lat, lng) !== null;
}
