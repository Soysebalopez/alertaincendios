/**
 * Which FIRMS fires a city page shows (WHI-907).
 *
 * "vegetation" (the default for every city page since 2026-10-01, and for
 * Bahía Blanca since WHI-907): every fire the site reports — forest or not —
 * without volcanoes, industrial flares, offshore sources or known fixed heat
 * sites. It is exactly `isReportedFire` (lib/reported-fires), the same rule
 * the home and /mapa use. "forest": only fires inside one of the forest zones,
 * the rule every city page used before (WHI-758); kept for callers that want it.
 */
import { isReportedFire } from "@/lib/reported-fires";

export type CityFireFilter = "forest" | "vegetation";

export function showsFire(
  fire: { type?: number; forestZone?: string; latitude?: number; longitude?: number },
  filter: CityFireFilter,
): boolean {
  if (filter === "forest") return Boolean(fire.forestZone);
  // Sin posición no se puede mirar la lista de fuentes fijas: decide el tipo
  // (como antes). En la práctica todo foco de /api/fires trae posición.
  if (fire.latitude === undefined || fire.longitude === undefined) {
    return (fire.type ?? 0) === 0;
  }
  return isReportedFire({
    latitude: fire.latitude,
    longitude: fire.longitude,
    frp: 0,
    type: fire.type,
    forestZone: fire.forestZone,
  });
}
