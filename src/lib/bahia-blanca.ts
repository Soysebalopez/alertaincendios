/**
 * Bahía Blanca, the first city with its own page and local data (WHI-907).
 */
import { haversineKm } from "@/lib/geo";

// Same point as "Bahia Blanca" in PROVINCES (src/lib/argentina-cities.ts), the
// list the bot subscribes with; a test keeps the two equal.
export const BAHIA_BLANCA = {
  name: "Bahía Blanca",
  province: "Buenos Aires",
  lat: -38.7196,
  lng: -62.2724,
} as const;
export const BAHIA_PAGE_PATH = "/bahia-blanca";
/** The generic city URL, redirected to BAHIA_PAGE_PATH in next.config.ts. */
export const BAHIA_GENERIC_CITY_PATH = "/ciudad/buenos-aires/bahia-blanca";
export const BAHIA_BOT_URL = "https://t.me/alertaforestal_bot?start=ciudad-bahia-blanca";
/** Fires this close get the "Ver hacia dónde va" link, and only they can be focused on the page. */
export const BAHIA_FOCUS_RADIUS_KM = 100;
const DEFAULT_SITE_URL = "https://alertaforestal.org";

function nearBahia(lat: number, lng: number): boolean {
  return haversineKm(lat, lng, BAHIA_BLANCA.lat, BAHIA_BLANCA.lng) <= BAHIA_FOCUS_RADIUS_KM;
}

/** `?foco=<lat>,<lng>` → a point near Bahía Blanca, or null. */
export function parseFocus(raw: string | string[] | undefined): { lat: number; lng: number } | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length !== 2) return null;
  const [lat, lng] = parts.map((part) => (part.trim() === "" ? NaN : Number(part)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return nearBahia(lat, lng) ? { lat, lng } : null;
}

/** Link from a fire alert to the Bahía Blanca map centered on the fire; null when the fire is not near Bahía. */
export function bahiaMapLink(lat: number, lng: number, siteUrl: string = DEFAULT_SITE_URL): string | null {
  if (!nearBahia(lat, lng)) return null;
  return `${siteUrl.replace(/\/$/, "")}${BAHIA_PAGE_PATH}?foco=${lat.toFixed(4)},${lng.toFixed(4)}`;
}
