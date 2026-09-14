/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
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

/**
 * Initial great-circle bearing from one point to another, in degrees
 * (0 = north, 90 = east, range [0, 360)).
 */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest absolute difference between two compass angles, in [0, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Half-width of the sector around the wind axis counted as "smoke toward the user". */
export const SMOKE_TOWARD_HALF_ANGLE_DEG = 60;

/**
 * Whether the wind carries a fire's smoke toward the user.
 *
 * `windFromDeg` uses the meteorological convention (Open-Meteo, METAR): the
 * compass bearing the wind blows FROM. Smoke reaches the user when the fire
 * sits on that side, i.e. when the bearing user→fire is close to windFromDeg.
 * (WHI-908: the previous `isUpwind` compared against windFromDeg + 180 and
 * reported the opposite.)
 */
export function smokeHeadsTowardUser(
  userLat: number,
  userLng: number,
  fireLat: number,
  fireLng: number,
  windFromDeg: number
): { headsToward: boolean; angleDiff: number } {
  const angleDiff = angleDiffDeg(
    bearingDegrees(userLat, userLng, fireLat, fireLng),
    windFromDeg
  );
  return { headsToward: angleDiff < SMOKE_TOWARD_HALF_ANGLE_DEG, angleDiff };
}

/**
 * Calculates smoke ETA in minutes given distance and wind speed.
 * Returns -1 if the smoke is not heading toward the user or the wind is calm.
 */
export function smokeEtaMinutes(
  distanceKm: number,
  windSpeedKmh: number,
  headsToward: boolean
): number {
  if (!headsToward || windSpeedKmh <= 0) return -1;
  const windMs = windSpeedKmh / 3.6;
  return Math.round((distanceKm * 1000) / windMs / 60);
}
