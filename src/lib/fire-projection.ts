/**
 * Smoke and fire-front projection for the map (WHI-907 part 11).
 *
 * Two separate things, never merged:
 *  - SMOKE: a sector downwind. Reach = wind speed × time (capped at 3 h);
 *    the half-angle stands for the uncertainty in wind direction, measured
 *    against the Bahía Blanca airport (see smokeHalfAngleDeg).
 *  - FIRE FRONT: only for a confirmed fire and only when the CSIRO grassfire
 *    rule applies (see fire-spread.ts). The head advances 20% of the wind;
 *    the shape is the Canadian FBP O-1 grass ellipse (length/breadth =
 *    1.1 × U^0.464, U = 10-m wind in km/h) with the fire at its rear focus.
 *
 * Wind direction is where the wind blows FROM. The ~20 min build-up from a
 * point ignition is ignored and gusts can surge ahead: the shapes mean "if the
 * wind holds", a near-worst case, not a simulation. Every shape expires.
 */
import { CSIRO_SPREAD_FRACTION_OF_WIND, csiroConditionsMet } from "@/lib/fire-spread";

const EARTH_RADIUS_KM = 6371;
export const SMOKE_MAX_MINUTES = 180;
export const CALM_WIND_KMH = 10;
export const FRONT_ETAS_MIN = [30, 60, 120, 180] as const;
type HalfAngleRow = { belowKmh: number; degrees: number };

// Measured on 2026-09-14 against the Bahía Blanca airport (METAR SAZB), wind of
// 10 km/h or more: Open-Meteo over 15/7–13/9 (756 hours) and SMN WRF 3–15 h
// ahead (120 hours). Each value is the half-angle that held the real wind
// direction 9 times out of 10, rounded up to 5°. Stronger wind keeps its
// direction better; the SMN erred more, above all further ahead.
const OPEN_METEO_HALF_ANGLES: readonly HalfAngleRow[] = [
  { belowKmh: 20, degrees: 40 },
  { belowKmh: 30, degrees: 30 },
  { belowKmh: Infinity, degrees: 25 },
];
const SMN_HALF_ANGLES: readonly HalfAngleRow[] = [
  { belowKmh: 20, degrees: 55 },
  { belowKmh: 30, degrees: 40 },
  { belowKmh: Infinity, degrees: 25 },
];
const HALF_ANGLES_BY_SOURCE: Record<string, readonly HalfAngleRow[]> = {
  "open-meteo": OPEN_METEO_HALF_ANGLES,
  "smn-wrf": SMN_HALF_ANGLES,
};
const WIDEST_HALF_ANGLE_DEG = 55;

/** Half-angle of the smoke sector that held the real wind direction 9 times out of 10. */
export function smokeHalfAngleDeg(windKmh: number, windSource: string): number {
  const table = HALF_ANGLES_BY_SOURCE[windSource] ?? SMN_HALF_ANGLES;
  return table.find((row) => windKmh < row.belowKmh)?.degrees ?? WIDEST_HALF_ANGLE_DEG;
}
export const VALIDITY_MINUTES = 60;
const VARIABLE_WIND_RADIUS_KM = 2;
const SECTOR_ARC_POINTS = 11;
const RING_POINTS = 36;

type LngLat = [number, number];
type Point = { lat: number; lng: number };

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: LngLat[][];
}

export interface ProjectionProperties {
  kind: "smoke" | "front" | "variable";
  eta_minutes?: number;
  possible_fire?: boolean;
  half_angle_deg?: number;
  wind_from_deg: number;
  wind_kmh: number;
  wind_source: string;
  csiro_conditions_met: boolean;
  issued_at: string;
  valid_to: string;
}

export interface ProjectionFeature {
  type: "Feature";
  geometry: PolygonGeometry;
  properties: ProjectionProperties;
}

export interface ProjectionCollection {
  type: "FeatureCollection";
  features: ProjectionFeature[];
}

export interface ProjectFireInput {
  origin: Point;
  windFromDeg: number;
  windKmh: number;
  tempC: number;
  rhPct: number | null;
  /** FIRMS-confirmed fire. A GOES preliminary only gets the smoke sector. */
  confirmed: boolean;
  issuedAt?: Date;
  windSource?: string;
  halfAngleDeg?: number;
}

/** Length-to-breadth ratio of a grass fire (Canadian FBP, fuel type O-1). */
export function lengthToBreadth(windKmh: number): number {
  return windKmh < 1 ? 1 : 1.1 * windKmh ** 0.464;
}

/** Point reached from (lat, lng) along an initial bearing, as [lat, lng]. */
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distKm: number
): [number, number] {
  const δ = distKm / EARTH_RADIUS_KM;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(φ2 * 180) / Math.PI, ((((λ2 * 180) / Math.PI + 540) % 360) + 360) % 360 - 180];
}

function polygon(ring: LngLat[]): PolygonGeometry {
  return { type: "Polygon", coordinates: [ring] };
}

/** Downwind smoke sector: origin → arc at wind × time → origin. */
export function smokeSector(
  origin: Point,
  windFromDeg: number,
  windKmh: number,
  minutes: number,
  halfAngleDeg: number
): { type: "Feature"; geometry: PolygonGeometry; properties: { kind: "smoke"; half_angle_deg: number } } {
  const axis = (windFromDeg + 180) % 360;
  const reachKm = (windKmh * Math.min(minutes, SMOKE_MAX_MINUTES)) / 60;
  const ring: LngLat[] = [[origin.lng, origin.lat]];
  for (let i = 0; i < SECTOR_ARC_POINTS; i++) {
    const bearing = axis - halfAngleDeg + (2 * halfAngleDeg * i) / (SECTOR_ARC_POINTS - 1);
    const [lat, lng] = destinationPoint(origin.lat, origin.lng, bearing, reachKm);
    ring.push([lng, lat]);
  }
  ring.push([origin.lng, origin.lat]);
  return { type: "Feature", geometry: polygon(ring), properties: { kind: "smoke", half_angle_deg: halfAngleDeg } };
}

/** Where the fire front could be after `minutes`, if the wind holds. */
export function frontIsochrone(
  origin: Point,
  windFromDeg: number,
  windKmh: number,
  minutes: number
): { type: "Feature"; geometry: PolygonGeometry; properties: { kind: "front"; eta_minutes: number } } {
  const axis = (windFromDeg + 180) % 360;
  const headKm = (CSIRO_SPREAD_FRACTION_OF_WIND * windKmh * minutes) / 60;
  const ratio = lengthToBreadth(windKmh);
  const eccentricity = Math.sqrt(Math.max(0, 1 - 1 / (ratio * ratio)));
  // The ignition sits at the rear focus: center - c = origin, center + a = head.
  const a = headKm / (1 + eccentricity);
  const b = a / ratio;
  const [centerLat, centerLng] = destinationPoint(origin.lat, origin.lng, axis, headKm - a);

  const ring: LngLat[] = [];
  for (let i = 0; i < RING_POINTS; i++) {
    const t = (2 * Math.PI * i) / RING_POINTS;
    const along = a * Math.cos(t);
    const across = b * Math.sin(t);
    const bearing = axis + (Math.atan2(across, along) * 180) / Math.PI;
    const [lat, lng] = destinationPoint(centerLat, centerLng, bearing, Math.hypot(along, across));
    ring.push([lng, lat]);
  }
  ring.push(ring[0]);
  return { type: "Feature", geometry: polygon(ring), properties: { kind: "front", eta_minutes: minutes } };
}

function circle(origin: Point, radiusKm: number): PolygonGeometry {
  const ring: LngLat[] = [];
  for (let i = 0; i < RING_POINTS; i++) {
    const [lat, lng] = destinationPoint(origin.lat, origin.lng, (360 * i) / RING_POINTS, radiusKm);
    ring.push([lng, lat]);
  }
  ring.push(ring[0]);
  return polygon(ring);
}

/** Shapes to draw for one fire, applying the "when not to draw" rules. */
export function projectFire(input: ProjectFireInput): ProjectionCollection {
  const issued = input.issuedAt ?? new Date();
  const common = {
    wind_from_deg: input.windFromDeg,
    wind_kmh: input.windKmh,
    wind_source: input.windSource ?? "unknown",
    csiro_conditions_met: csiroConditionsMet({
      windKmh: input.windKmh,
      tempC: input.tempC,
      rhPct: input.rhPct,
    }),
    issued_at: issued.toISOString(),
    valid_to: new Date(issued.getTime() + VALIDITY_MINUTES * 60_000).toISOString(),
  };

  if (input.windKmh < CALM_WIND_KMH) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: circle(input.origin, VARIABLE_WIND_RADIUS_KM),
          properties: { kind: "variable", ...common },
        },
      ],
    };
  }

  const smoke = smokeSector(
    input.origin,
    input.windFromDeg,
    input.windKmh,
    SMOKE_MAX_MINUTES,
    input.halfAngleDeg ?? smokeHalfAngleDeg(input.windKmh, input.windSource ?? "unknown")
  );
  const features: ProjectionFeature[] = [
    { ...smoke, properties: { ...smoke.properties, possible_fire: !input.confirmed, ...common } },
  ];

  if (input.confirmed && common.csiro_conditions_met) {
    for (const eta of FRONT_ETAS_MIN) {
      const front = frontIsochrone(input.origin, input.windFromDeg, input.windKmh, eta);
      features.push({ ...front, properties: { ...front.properties, ...common } });
    }
  }

  return { type: "FeatureCollection", features };
}
