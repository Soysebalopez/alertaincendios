/**
 * Which FIRMS fires a city page shows (WHI-907).
 *
 * "forest": only fires inside one of the forest zones — every city page, as
 * before (WHI-758). "vegetation": every vegetation fire, forest or not, still
 * without industrial flares (VIIRS type 2), volcanoes (1) or offshore sources
 * (3). Bahía Blanca uses it: it is grassland and lies in no forest zone, so
 * the forest filter would hide a grassfire 20 km from the city.
 */
export type CityFireFilter = "forest" | "vegetation";

export function showsFire(
  fire: { type?: number; forestZone?: string },
  filter: CityFireFilter,
): boolean {
  if (filter === "vegetation") return (fire.type ?? 0) === 0;
  return Boolean(fire.forestZone);
}
