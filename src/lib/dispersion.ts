/**
 * Simplified Gaussian plume dispersion model.
 * Adapted from SatAI — generalized for any location in Argentina.
 *
 * Reference: Pasquill-Gifford stability classes (simplified)
 */

export interface DispersionInput {
  source: [number, number]; // [lng, lat]
  windDirection: number;
  windSpeed: number;
  windGusts: number;
  eventType: "fuga_gas" | "incendio_industrial" | "derrame";
  durationMinutes: number;
  /** Nearby cities to evaluate impact (optional, dynamic) */
  nearbyZones?: Array<{ name: string; lat: number; lng: number }>;
}

export interface DispersionResult {
  plumes: Array<{
    level: "high" | "medium" | "low";
    label: string;
    color: string;
    opacity: number;
    polygon: [number, number][];
    reachesZones: string[];
    /** null = wind calm (no dispersion); UI shows "sin dispersión". */
    etaMinutes: number | null;
  }>;
  windBearing: number;
  affectedZones: Array<{
    name: string;
    distanceKm: number;
    /** null = wind calm (no dispersion); UI shows "sin dispersión". */
    etaMinutes: number | null;
    concentrationLevel: "high" | "medium" | "low" | "none";
  }>;
  summary: string;
}

const EVENT_PARAMS: Record<
  string,
  { spreadFactor: number; heightM: number; label: string }
> = {
  fuga_gas: { spreadFactor: 1.2, heightM: 5, label: "Fuga de gas" },
  incendio_industrial: {
    spreadFactor: 1.0,
    heightM: 50,
    label: "Incendio industrial",
  },
  derrame: { spreadFactor: 0.6, heightM: 2, label: "Derrame" },
};

export function calculateDispersion(
  input: DispersionInput,
): DispersionResult {
  const {
    source,
    windDirection,
    windSpeed,
    windGusts,
    eventType,
    durationMinutes,
    nearbyZones = [],
  } = input;
  const params = EVENT_PARAMS[eventType] || EVENT_PARAMS.fuga_gas;

  const plumeBearing = (windDirection + 180) % 360;
  const bearingRad = (plumeBearing * Math.PI) / 180;
  const windMs = windSpeed / 3.6;
  const gustMs = windGusts / 3.6;

  const distances = {
    high:
      Math.min(
        windMs * durationMinutes * 60 * 0.3 * params.spreadFactor,
        5000,
      ) / 1000,
    medium:
      Math.min(
        windMs * durationMinutes * 60 * 0.6 * params.spreadFactor,
        12000,
      ) / 1000,
    low:
      Math.min(
        gustMs * durationMinutes * 60 * 0.9 * params.spreadFactor,
        25000,
      ) / 1000,
  };

  // Convention: each ring's ETA uses the SAME wind speed its distance was
  // computed with — the "low" ring spreads with gusts, so its ETA is gust-based;
  // "high"/"medium" use the mean wind. Otherwise distance and ETA disagree.
  const ringSpeedMs = { high: windMs, medium: windMs, low: gustMs };

  const spreadAngle = { high: 15, medium: 25, low: 40 };

  const plumes = (["high", "medium", "low"] as const).map((level) => {
    const dist = distances[level];
    const angle = spreadAngle[level];
    const speedMs = ringSpeedMs[level];
    const polygon = generatePlumePolygon(source, bearingRad, dist, angle);
    // null = calm (no advective transport): no meaningful ETA.
    const etaMinutes =
      speedMs > 0 ? Math.round((dist * 1000) / speedMs / 60) : null;

    const reachesZones = nearbyZones
      .filter((zone) =>
        isPointInPlume(zone.lng, zone.lat, source, bearingRad, dist, angle),
      )
      .map((z) => z.name);

    const config = {
      high: {
        label: "Alta concentracion",
        color: "#ef4444",
        opacity: 0.35,
      },
      medium: {
        label: "Concentracion media",
        color: "#f97316",
        opacity: 0.25,
      },
      low: {
        label: "Baja concentracion",
        color: "#eab308",
        opacity: 0.15,
      },
    };

    return { level, ...config[level], polygon, reachesZones, etaMinutes };
  });

  const affectedZones = nearbyZones
    .map((zone) => {
      const distKm = haversineKm(source[1], source[0], zone.lat, zone.lng);
      // null = calm (no advective transport): no meaningful ETA.
      const etaMinutes =
        windMs > 0 ? Math.round((distKm * 1000) / windMs / 60) : null;

      let concentrationLevel: "high" | "medium" | "low" | "none" = "none";
      if (
        isPointInPlume(
          zone.lng,
          zone.lat,
          source,
          bearingRad,
          distances.high,
          spreadAngle.high,
        )
      ) {
        concentrationLevel = "high";
      } else if (
        isPointInPlume(
          zone.lng,
          zone.lat,
          source,
          bearingRad,
          distances.medium,
          spreadAngle.medium,
        )
      ) {
        concentrationLevel = "medium";
      } else if (
        isPointInPlume(
          zone.lng,
          zone.lat,
          source,
          bearingRad,
          distances.low,
          spreadAngle.low,
        )
      ) {
        concentrationLevel = "low";
      }

      return {
        name: zone.name,
        distanceKm: Math.round(distKm * 10) / 10,
        // null when out of plume or calm — no ETA to show.
        etaMinutes: concentrationLevel !== "none" ? etaMinutes : null,
        concentrationLevel,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const affected = affectedZones.filter(
    (z) => z.concentrationLevel !== "none",
  );
  const summary =
    affected.length > 0
      ? `Simulacion de ${params.label.toLowerCase()} con viento de ${windSpeed} km/h. Zonas potencialmente afectadas: ${affected.map((z) => `${z.name} (${z.etaMinutes !== null ? `${z.etaMinutes} min` : "sin dispersión"})`).join(", ")}.`
      : `Simulacion de ${params.label.toLowerCase()} con viento de ${windSpeed} km/h. Segun las condiciones actuales, la dispersion no alcanza zonas pobladas en ${durationMinutes} minutos.`;

  return { plumes, windBearing: plumeBearing, affectedZones, summary };
}

function generatePlumePolygon(
  source: [number, number],
  bearingRad: number,
  distKm: number,
  spreadAngleDeg: number,
): [number, number][] {
  const points: [number, number][] = [source];
  const spreadRad = (spreadAngleDeg * Math.PI) / 180;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const angle = bearingRad - spreadRad + (2 * spreadRad * i) / steps;
    points.push(offsetPoint(source, angle, distKm));
  }
  points.push(source);
  return points;
}

function isPointInPlume(
  lng: number,
  lat: number,
  source: [number, number],
  bearingRad: number,
  distKm: number,
  spreadAngleDeg: number,
): boolean {
  const pointDist = haversineKm(source[1], source[0], lat, lng);
  if (pointDist > distKm) return false;

  // Spherical bearing in compass convention (0 = N, clockwise), matching the
  // plume `bearingRad` which derives from a compass wind direction. The old
  // flat-earth atan2 used a mathematical convention and disagreed with the cone.
  const pointBearing = compassBearingRad(source[1], source[0], lat, lng);

  let angleDiff = Math.abs(pointBearing - bearingRad);
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

  return angleDiff <= (spreadAngleDeg * Math.PI) / 180;
}

/**
 * Great-circle initial bearing from (lat1,lng1) to (lat2,lng2), returned in
 * radians on the compass convention (0 = North, increasing clockwise),
 * normalized to [0, 2π). Consistent with the plume's `bearingRad`.
 */
function compassBearingRad(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ + 2 * Math.PI) % (2 * Math.PI);
}

function offsetPoint(
  origin: [number, number],
  bearingRad: number,
  distKm: number,
): [number, number] {
  const latRad = (origin[1] * Math.PI) / 180;
  const dLat = (distKm / 111.32) * Math.cos(bearingRad);
  const dLng = (distKm / (111.32 * Math.cos(latRad))) * Math.sin(bearingRad);
  return [origin[0] + dLng, origin[1] + dLat];
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
