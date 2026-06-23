import { haversineKm } from "@/lib/geo";

export interface DangerZoneBox {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // [south, north, west, east]
}

const ZONE_BUFFER_KM = 5;

function distanceKmToBbox(
  lat: number,
  lng: number,
  [south, north, west, east]: [number, number, number, number]
): number {
  const clampedLat = Math.max(south, Math.min(north, lat));
  const clampedLng = Math.max(west, Math.min(east, lng));
  return haversineKm(lat, lng, clampedLat, clampedLng);
}

export function findDangerZone(
  lat: number,
  lng: number,
  zones: DangerZoneBox[]
): DangerZoneBox | null {
  // fast path: strictly inside a bbox
  for (const z of zones) {
    const [south, north, west, east] = z.bbox;
    if (lat >= south && lat <= north && lng >= west && lng <= east) return z;
  }
  // buffer path: within ZONE_BUFFER_KM of the nearest bbox edge
  let best: DangerZoneBox | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    const d = distanceKmToBbox(lat, lng, z.bbox);
    if (d <= ZONE_BUFFER_KM && d < bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}
