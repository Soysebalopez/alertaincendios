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
// (SSP) enters the Argentina bbox. VIIRS swath is ~3060 km wide so the satellite
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

export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return "ahora";
  const totalMinutes = Math.floor(msUntil / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}
