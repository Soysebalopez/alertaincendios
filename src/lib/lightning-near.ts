/**
 * Real lightning near a subscriber (WHI-907 part 2).
 *
 * GOES-19 GLM locates a flash within ~8–14 km, so "near" means 30 km. A dry
 * thunderstorm needs a real flash nearby AND known dry air: with unknown
 * humidity or rain we do not claim the storm is dry.
 */
import { haversineKm } from "@/lib/geo";

export interface Flash {
  flashAt: string;
  lat: number;
  lng: number;
}

export const GLM_NEAR_RADIUS_KM = 30;
export const DRY_HUMIDITY_THRESHOLD = 60;
export const DRY_RAIN_THRESHOLD_MM = 0.5;
export const GLM_MAX_DATA_AGE_MINUTES = 15;

/** Flashes within `radiusKm` of (lat, lng), nearest first, with their distance. */
export function flashesNear<F extends Flash>(
  flashes: F[],
  lat: number,
  lng: number,
  radiusKm: number = GLM_NEAR_RADIUS_KM
): Array<F & { distKm: number }> {
  return flashes
    .map((flash) => ({ ...flash, distKm: haversineKm(lat, lng, flash.lat, flash.lng) }))
    .filter((flash) => flash.distKm <= radiusKm)
    .sort((a, b) => a.distKm - b.distKm);
}

export function isDryLightningRisk(input: {
  flashesNearby: number;
  humidity: number | null;
  recentRainMm: number | null;
}): boolean {
  if (input.flashesNearby <= 0 || input.humidity === null || input.recentRainMm === null) {
    return false;
  }
  return input.humidity < DRY_HUMIDITY_THRESHOLD && input.recentRainMm < DRY_RAIN_THRESHOLD_MM;
}

/** True when the GLM sync wrote recently enough to trust "no flashes" as real. */
export function glmDataIsFresh(
  lastInsertedAt: string | null,
  now: Date,
  maxAgeMinutes: number = GLM_MAX_DATA_AGE_MINUTES
): boolean {
  if (!lastInsertedAt) return false;
  const written = Date.parse(lastInsertedAt);
  if (Number.isNaN(written)) return false;
  return now.getTime() - written <= maxAgeMinutes * 60_000;
}
