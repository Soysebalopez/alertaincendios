/**
 * Which FIRMS fires a city page shows (WHI-907).
 *
 * "forest": only fires inside one of the forest zones — every city page, as
 * before (WHI-758). "vegetation": every vegetation fire, forest or not, without
 * volcanoes (VIIRS type 1), industrial flares (2) or offshore sources (3).
 * Bahía Blanca uses it: it is grassland and lies in no forest zone, so the
 * forest filter would hide a grassfire 20 km from the city. The near-real-time
 * feed carries no type, so known flare sites are also removed by position.
 */
import { isStaticHeatSource } from "@/lib/static-heat-sources";

export type CityFireFilter = "forest" | "vegetation";

export function showsFire(
  fire: { type?: number; forestZone?: string; latitude?: number; longitude?: number },
  filter: CityFireFilter,
): boolean {
  if (filter === "forest") return Boolean(fire.forestZone);
  if ((fire.type ?? 0) !== 0) return false;
  const located = fire.latitude !== undefined && fire.longitude !== undefined;
  return !(located && isStaticHeatSource(fire.latitude as number, fire.longitude as number));
}
