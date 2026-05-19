/**
 * Zonas forestales argentinas — polígonos hand-drawn para WHI-757.
 *
 * Cinco polígonos que cubren las regiones donde los incendios térmicos
 * detectados por VIIRS/GOES tienen alta probabilidad de ser incendios
 * forestales reales (y no quemas agrícolas controladas o flaring industrial).
 *
 * Precisión: ~20-30 km en bordes. Suficiente para clasificación binaria
 * "is in forest zone" en visualización + alertas Telegram.
 *
 * Decisión: arrancamos hand-drawn por velocidad. Para v2 podemos reemplazar
 * con MapBiomas Argentina o el Mapa Nacional de Bosques Nativos (MAyDS) sin
 * tocar el resto del código — solo este archivo cambia.
 *
 * Chaco norte queda DELIBERADAMENTE afuera del MVP — alta superposición con
 * quema agrícola. Lo abordamos por separado con un polígono v2 dedicado.
 *
 * Formato: arrays [longitude, latitude] (convención GeoJSON), cerrados (el
 * último punto repite el primero).
 */

export type ForestZone = {
  id: string;
  name: string;
  /** Anillo exterior del polígono. Formato GeoJSON: [[lng, lat], ...]. */
  polygon: Array<[number, number]>;
};

export const FOREST_ZONES: ForestZone[] = [
  {
    id: "andino-patagonico",
    name: "Bosque Andino Patagónico",
    polygon: [
      [-73.0, -36.0],
      [-70.0, -36.0],
      [-69.5, -42.0],
      [-71.0, -50.0],
      [-68.0, -55.0],
      [-71.0, -55.5],
      [-73.0, -54.0],
      [-73.0, -36.0],
    ],
  },
  {
    id: "yungas",
    name: "Yungas",
    polygon: [
      [-66.0, -22.0],
      [-64.0, -22.0],
      [-64.5, -27.0],
      [-65.5, -27.0],
      [-66.0, -22.0],
    ],
  },
  {
    id: "selva-misionera",
    name: "Selva Misionera",
    polygon: [
      // Triple frontera (Iguazú) → cubre todo Misiones + Corrientes NE
      [-57.0, -25.4],
      [-53.6, -25.4],
      [-53.6, -27.5],
      [-54.5, -28.5],
      [-56.0, -29.0],
      [-57.0, -28.0],
      [-57.0, -25.4],
    ],
  },
  {
    id: "espinal-mesopotamico",
    name: "Espinal Mesopotámico",
    polygon: [
      [-59.0, -29.0],
      [-57.5, -29.0],
      [-58.0, -33.5],
      [-60.0, -33.0],
      [-59.0, -29.0],
    ],
  },
  {
    id: "sierras-cordoba",
    name: "Sierras de Córdoba",
    polygon: [
      [-65.5, -30.0],
      [-64.3, -30.0],
      [-64.3, -33.0],
      [-65.5, -33.0],
      [-65.5, -30.0],
    ],
  },
];

/**
 * Ray-casting algorithm para point-in-polygon. Acepta cualquier polígono
 * simple (no self-intersecting). Devuelve true si (lng, lat) está adentro.
 *
 * No usa turf.js — para ray-casting puro contra 5 polígonos de <10 vértices
 * cada uno, una función de 8 líneas es más simple y evita ~50KB de bundle.
 */
function pointInPolygon(lng: number, lat: number, ring: Array<[number, number]>): boolean {
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

// WHI-760: distancia perpendicular del punto a un segmento, en kilómetros.
// Para nuestras escalas (buffer 5km vs polígonos de 100s km) la fórmula de
// cross-track distance del gran círculo es adecuada (<1% de error).
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

function minDistanceKmToRing(
  lat: number,
  lng: number,
  ring: Array<[number, number]>
): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [sLng, sLat] = ring[j];
    const [eLng, eLat] = ring[i];
    const d = pointToSegmentDistanceKm(lat, lng, sLat, sLng, eLat, eLng);
    if (d < min) min = d;
  }
  return min;
}

/** WHI-760: buffer WUI alrededor de zonas forestales. */
export const FOREST_BUFFER_KM = 5;

/**
 * Clasifica un punto (lat, lng) como dentro/fuera de las zonas forestales.
 * Devuelve la zona si match (incluido buffer WUI de FOREST_BUFFER_KM), o
 * null si está fuera de todas.
 *
 * WHI-760: el buffer captura el wildland-urban interface — focos en bordes
 * urbanos de zonas forestales (Bariloche, Villa Carlos Paz, Esquel) que
 * conceptualmente son zona de prevención forestal aunque su coordenada
 * caiga unos km afuera del polígono nativo.
 */
export function findForestZone(lat: number, lng: number): ForestZone | null {
  // Fast path: punto adentro de algún polígono.
  for (const zone of FOREST_ZONES) {
    if (pointInPolygon(lng, lat, zone.polygon)) return zone;
  }
  // Slow path: punto cerca del borde de algún polígono (WUI buffer).
  let bestZone: ForestZone | null = null;
  let bestDistance = FOREST_BUFFER_KM;
  for (const zone of FOREST_ZONES) {
    const d = minDistanceKmToRing(lat, lng, zone.polygon);
    if (d < bestDistance) {
      bestDistance = d;
      bestZone = zone;
    }
  }
  return bestZone;
}

/**
 * Versión booleana — usada cuando solo importa el flag, no qué zona.
 */
export function isInForestZone(lat: number, lng: number): boolean {
  return findForestZone(lat, lng) !== null;
}

/**
 * Lookup del nombre legible a partir del id (que es lo que viaja en
 * FirePoint.forestZone). Útil para mensajes de bot y tooltips.
 */
export function forestZoneName(id?: string | null): string | null {
  if (!id) return null;
  return FOREST_ZONES.find((z) => z.id === id)?.name ?? null;
}
