import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
} from "satellite.js";

export type SatelliteTLE = {
  norad_id: number;
  name: string;
  line1: string;
  line2: string;
  fetched_at: string;
};

// VIIRS-equipped satellites — NASA FIRMS data sources.
export const VIIRS_NORAD_IDS = {
  SUOMI_NPP: 37849,
  NOAA_20: 43013,
  NOAA_21: 54234,
} as const;

// Argentina bounding box (continental).
const ARG_BBOX = {
  north: -21.78,
  south: -55.06,
  west: -73.58,
  east: -53.64,
} as const;

// Propagation tuning. The "next pass" we display is when the sub-satellite point
// (SSP) enters the Argentina bbox. VIIRS swath is ~3040 km wide so the satellite
// already starts observing Argentina before the SSP crosses the border, but for
// the badge ("próximo pase") the SSP-over-Argentina moment is the most intuitive
// definition and ±5 min of error is fine.
const STEP_MS = 60_000; // 1 min — coarse but VIIRS ground track moves ~7 km/s so passes are wide
const HORIZON_MS = 24 * 60 * 60_000; // search up to 24h forward
const STALE_TLE_MS = 7 * 24 * 60 * 60_000; // ignore TLEs older than 7 days

export type NextPass = {
  norad_id: number;
  name: string;
  startsAt: Date;
  msUntil: number;
};

function isOverArgentina(lat: number, lng: number): boolean {
  return (
    lat <= ARG_BBOX.north &&
    lat >= ARG_BBOX.south &&
    lng >= ARG_BBOX.west &&
    lng <= ARG_BBOX.east
  );
}

function subSatellitePoint(
  satrec: ReturnType<typeof twoline2satrec>,
  date: Date
): { lat: number; lng: number } | null {
  const pv = propagate(satrec, date);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = gstime(date);
  // satellite.js Radians branded type; cast back through degreesLat/Long.
  const geo = eciToGeodetic(pv.position, gmst);
  return {
    lat: degreesLat(geo.latitude),
    lng: degreesLong(geo.longitude),
  };
}

/**
 * Find the next time any of the provided satellites passes over Argentina.
 *
 * "Pass" is defined as the sub-satellite point entering the Argentina bbox.
 * Returns the earliest pass across all valid TLEs, or null if no TLE is fresh
 * enough (<7 days) or no pass found within 24h.
 *
 * Search is O(satellites × HORIZON_MS / STEP_MS) = 3 × 1440 = 4320 propagations.
 * SGP4 is fast (~µs per call), so this runs in <50 ms total in practice.
 */
export function computeNextPassOverArgentina(
  tles: SatelliteTLE[],
  now: Date = new Date()
): NextPass | null {
  let best: NextPass | null = null;

  for (const tle of tles) {
    if (!tle.line1 || !tle.line2) continue;
    const fetchedAt = Date.parse(tle.fetched_at);
    if (!Number.isFinite(fetchedAt)) continue;
    if (Date.now() - fetchedAt > STALE_TLE_MS) continue;

    let satrec;
    try {
      satrec = twoline2satrec(tle.line1, tle.line2);
    } catch {
      continue;
    }

    for (let dt = 0; dt < HORIZON_MS; dt += STEP_MS) {
      const date = new Date(now.getTime() + dt);
      const ssp = subSatellitePoint(satrec, date);
      if (ssp && isOverArgentina(ssp.lat, ssp.lng)) {
        if (!best || dt < best.msUntil) {
          best = {
            norad_id: tle.norad_id,
            name: tle.name,
            startsAt: date,
            msUntil: dt,
          };
        }
        break; // found this sat's next pass; move on to others
      }
    }
  }

  return best;
}

export type GroundTrackPoint = { lat: number; lng: number; at: number };

/**
 * Propaga la trayectoria sub-satelital de un TLE para visualización en mapa.
 * WHI-754 — ground track polyline en /mapa.
 *
 * Devuelve segmentos (no un array plano) porque la polyline se parte cuando
 * cruza el antimeridiano (lng salta de -180↔+180); si no, Leaflet traza una
 * línea recta que cruza el globo entero.
 *
 * Devuelve null si el TLE es viejo (>7 días) o malformado.
 *
 * stepMs por defecto = 30s — granularidad suficiente para que la polyline se
 * vea suave (el ground track se mueve ~7 km/s, 30s ≈ 210 km entre puntos).
 */
export function computeGroundTrack(
  tle: SatelliteTLE,
  durationMs = 3 * 60 * 60_000, // 3h forward (≈2 órbitas LEO)
  stepMs = 30_000,
  from: Date = new Date()
): GroundTrackPoint[][] | null {
  if (!tle.line1 || !tle.line2) return null;
  const fetchedAt = Date.parse(tle.fetched_at);
  if (!Number.isFinite(fetchedAt)) return null;
  if (Date.now() - fetchedAt > STALE_TLE_MS) return null;

  let satrec;
  try {
    satrec = twoline2satrec(tle.line1, tle.line2);
  } catch {
    return null;
  }

  const segments: GroundTrackPoint[][] = [];
  let current: GroundTrackPoint[] = [];
  let prevLng: number | null = null;

  for (let dt = 0; dt < durationMs; dt += stepMs) {
    const date = new Date(from.getTime() + dt);
    const ssp = subSatellitePoint(satrec, date);
    if (!ssp) continue;

    // Antimeridian crossing: split into a new segment so Leaflet doesn't draw
    // a horizontal line across the entire globe.
    if (prevLng !== null && Math.abs(ssp.lng - prevLng) > 180) {
      if (current.length > 0) segments.push(current);
      current = [];
    }
    current.push({ lat: ssp.lat, lng: ssp.lng, at: date.getTime() });
    prevLng = ssp.lng;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * Posición actual del satélite (sub-satellite point en el instante `date`).
 * Devuelve null si el TLE es viejo o malformado.
 */
export function currentSubSatellitePoint(
  tle: SatelliteTLE,
  date: Date = new Date()
): { lat: number; lng: number } | null {
  if (!tle.line1 || !tle.line2) return null;
  const fetchedAt = Date.parse(tle.fetched_at);
  if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > STALE_TLE_MS) {
    return null;
  }
  try {
    const satrec = twoline2satrec(tle.line1, tle.line2);
    return subSatellitePoint(satrec, date);
  } catch {
    return null;
  }
}

export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return "ahora";
  const totalMinutes = Math.floor(msUntil / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}

// VIIRS swath: 3040 km wide → 1520 km a cada lado del ground track. Una ciudad
// está "dentro del swath" durante una pasada si su distancia PERPENDICULAR
// (cross-track) al segmento del ground track entre dos muestras consecutivas
// es <1520 km. Medir contra el segmento (no contra un único SSP) elimina el
// error de medio paso de la versión anterior.
const VIIRS_SWATH_HALF_KM = 1520;
const COVERAGE_STEP_MS = 60_000; // 1 min
const COVERAGE_HORIZON_MS = 24 * 60 * 60_000; // 24h

export type CoverageEvent = {
  norad_id: number;
  name: string;
  at: Date;
  distanceKm: number;
};

const EARTH_R_KM = 6371;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = EARTH_R_KM;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

/**
 * Great-circle distance from point (lat,lng) to the segment of ground track
 * between two consecutive sub-satellite points. Returns the perpendicular
 * (cross-track) distance when the point projects onto the segment, else the
 * distance to the nearer endpoint. Ported from forest-zones-geo.ts.
 *
 * Using the cross-track distance (instead of distance to a single SSP sample)
 * removes the ~half-step sampling error: with 60s steps the track moves ~420 km
 * between samples, so a point-to-sample test could be off by ~210 km near a
 * city; the segment test bounds the error to the curvature within one step.
 */
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

/**
 * Busca la última cobertura VIIRS sobre (lat, lng) en las últimas 24h.
 * WHI-755 — base del card "VIIRS pasó hace 4h sin focos en tu zona".
 *
 * Estrategia: para cada satélite, itera HACIA ATRÁS en pasos de 1 min hasta
 * encontrar un instante con distancia city→SSP < swath. Devuelve el evento
 * más reciente (mayor timestamp) entre todos los sats.
 *
 * Costo: 3 sats × 1440 steps × (propagación SGP4 + haversine) ≈ 30 ms client.
 */
export function findLastVIIRSCoverage(
  lat: number,
  lng: number,
  tles: SatelliteTLE[],
  now: Date = new Date()
): CoverageEvent | null {
  let best: CoverageEvent | null = null;
  for (const tle of tles) {
    if (!tle.line1 || !tle.line2) continue;
    const fetchedAt = Date.parse(tle.fetched_at);
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > STALE_TLE_MS) continue;

    let satrec;
    try {
      satrec = twoline2satrec(tle.line1, tle.line2);
    } catch {
      continue;
    }

    // Walk backward; keep the previous (later-in-time) sample so we can measure
    // the perpendicular distance to the ground-track segment, not to a point.
    let prev: { lat: number; lng: number } | null = null;
    for (let dt = 0; dt < COVERAGE_HORIZON_MS; dt += COVERAGE_STEP_MS) {
      const date = new Date(now.getTime() - dt);
      const ssp = subSatellitePoint(satrec, date);
      if (!ssp) {
        prev = null;
        continue;
      }
      const distance = prev
        ? pointToSegmentDistanceKm(lat, lng, ssp.lat, ssp.lng, prev.lat, prev.lng)
        : haversineKm(lat, lng, ssp.lat, ssp.lng);
      if (distance < VIIRS_SWATH_HALF_KM) {
        if (!best || date.getTime() > best.at.getTime()) {
          best = { norad_id: tle.norad_id, name: tle.name, at: date, distanceKm: distance };
        }
        break; // first hit walking backward = most recent for this sat
      }
      prev = ssp;
    }
  }
  return best;
}

/**
 * Busca la próxima cobertura VIIRS sobre (lat, lng) en las próximas 24h.
 * WHI-755 — base del countdown "Próxima pasada VIIRS: 1h 47min" por ciudad.
 *
 * Misma estrategia que findLastVIIRSCoverage pero forward.
 */
export function findNextVIIRSCoverage(
  lat: number,
  lng: number,
  tles: SatelliteTLE[],
  now: Date = new Date()
): CoverageEvent | null {
  let best: CoverageEvent | null = null;
  for (const tle of tles) {
    if (!tle.line1 || !tle.line2) continue;
    const fetchedAt = Date.parse(tle.fetched_at);
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > STALE_TLE_MS) continue;

    let satrec;
    try {
      satrec = twoline2satrec(tle.line1, tle.line2);
    } catch {
      continue;
    }

    // Walk forward; keep the previous (earlier-in-time) sample so we can measure
    // the perpendicular distance to the ground-track segment, not to a point.
    let prev: { lat: number; lng: number } | null = null;
    for (let dt = 0; dt < COVERAGE_HORIZON_MS; dt += COVERAGE_STEP_MS) {
      const date = new Date(now.getTime() + dt);
      const ssp = subSatellitePoint(satrec, date);
      if (!ssp) {
        prev = null;
        continue;
      }
      const distance = prev
        ? pointToSegmentDistanceKm(lat, lng, prev.lat, prev.lng, ssp.lat, ssp.lng)
        : haversineKm(lat, lng, ssp.lat, ssp.lng);
      if (distance < VIIRS_SWATH_HALF_KM) {
        if (!best || date.getTime() < best.at.getTime()) {
          best = { norad_id: tle.norad_id, name: tle.name, at: date, distanceKm: distance };
        }
        break;
      }
      prev = ssp;
    }
  }
  return best;
}

export function formatTimeAgo(ms: number): string {
  if (ms < 60_000) return "recién";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `hace ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `hace ${hours}h` : `hace ${hours}h ${minutes}min`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}
