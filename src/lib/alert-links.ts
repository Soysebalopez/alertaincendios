/**
 * Map links at the end of a fire alert (WHI-907 part 9).
 */
import { bahiaMapLink } from "@/lib/bahia-blanca";

/** Telegram HTML: our Bahía Blanca map when the fire is near it, then Google Maps. */
export function alertMapLinks(lat: number, lng: number): string {
  const googleMaps = `📌 <a href="https://www.google.com/maps?q=${lat},${lng}&z=12">Ver en Google Maps</a>`;
  const ourMap = bahiaMapLink(lat, lng);
  return ourMap ? `🗺️ <a href="${ourMap}">Ver hacia dónde va</a>\n${googleMaps}` : googleMaps;
}
