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
 * Checks if a fire is upwind of a user (smoke blowing towards them).
 * Returns { isUpwind, angleDiff }.
 */
export function isUpwind(
  userLat: number,
  userLng: number,
  fireLat: number,
  fireLng: number,
  windDirection: number
): { isUpwind: boolean; angleDiff: number } {
  const fireAngle =
    Math.atan2(fireLng - userLng, fireLat - userLat) * (180 / Math.PI);
  const windBearing = (windDirection + 180) % 360; // direction wind is GOING
  let angleDiff = Math.abs(fireAngle - windBearing);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;
  return { isUpwind: angleDiff < 60, angleDiff };
}

/**
 * Calculates smoke ETA in minutes given distance and wind speed.
 * Returns -1 if not applicable (not upwind or no wind).
 */
export function smokeEtaMinutes(
  distanceKm: number,
  windSpeedKmh: number,
  upwind: boolean
): number {
  if (!upwind || windSpeedKmh <= 0) return -1;
  const windMs = windSpeedKmh / 3.6;
  return Math.round((distanceKm * 1000) / windMs / 60);
}
