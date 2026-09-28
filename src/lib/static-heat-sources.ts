/**
 * Fixed industrial heat sources that satellites report as fires (WHI-907).
 *
 * The FIRMS near-real-time feed (VIIRS_SNPP_NRT) has no "type" column, so
 * industrial flares arrive as vegetation fires. These sites come from the FIRMS
 * archive (VIIRS S-NPP, 2023–2024), which does classify static land sources
 * (type 2): 147 of them within 60 km of Bahía Blanca, in two clusters. Each
 * radius covers every archive flare cell of its site plus the ~375 m pixel and
 * its geolocation error. The offshore detections (type 3) in the port fall
 * inside the first site.
 */
import { haversineKm } from "@/lib/geo";
import { FUENTES_FIJAS_ARCHIVO } from "@/lib/static-heat-sources-archivo";

export const STATIC_HEAT_SOURCES = [
  // 99 archive flares; the farthest flare cell is 1.9 km from this centre.
  { name: "Polo petroquímico de Ingeniero White", lat: -38.7752, lng: -62.289, radiusKm: 3 },
  // 48 archive flares; the farthest flare cell is 0.7 km from this centre.
  { name: "Fuente industrial al noroeste de Bahía Blanca", lat: -38.6852, lng: -62.4146, radiusKm: 2 },
] as const;

/**
 * Is this point a FIXED heat source (flare, steel mill, refinery, volcano…)?
 *
 * Two lists: the two Bahía Blanca sites above (WHI-907, hand-checked) and,
 * since 28/9, every static site the FIRMS archive classifies across the whole
 * country (`static-heat-sources-archivo.ts`, generated). The field-and-grass
 * layer uses this to never announce an industry as a fire.
 */
export function isStaticHeatSource(lat: number, lng: number): boolean {
  if (STATIC_HEAT_SOURCES.some((site) => haversineKm(lat, lng, site.lat, site.lng) <= site.radiusKm)) return true;
  // Cheap reject first: every archive radius is ≤ a few km, so a latitude or
  // longitude gap of 0.1° (~11 km) can never be inside.
  return FUENTES_FIJAS_ARCHIVO.some(
    ([sLat, sLng, radiusKm]) =>
      Math.abs(lat - sLat) < 0.1 && Math.abs(lng - sLng) < 0.1 && haversineKm(lat, lng, sLat, sLng) <= radiusKm
  );
}
