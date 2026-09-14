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

export const STATIC_HEAT_SOURCES = [
  // 99 archive flares; the farthest flare cell is 1.9 km from this centre.
  { name: "Polo petroquímico de Ingeniero White", lat: -38.7752, lng: -62.289, radiusKm: 3 },
  // 48 archive flares; the farthest flare cell is 0.7 km from this centre.
  { name: "Fuente industrial al noroeste de Bahía Blanca", lat: -38.6852, lng: -62.4146, radiusKm: 2 },
] as const;

export function isStaticHeatSource(lat: number, lng: number): boolean {
  return STATIC_HEAT_SOURCES.some((site) => haversineKm(lat, lng, site.lat, site.lng) <= site.radiusKm);
}
