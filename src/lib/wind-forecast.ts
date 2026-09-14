/**
 * SMN WRF 4 km wind forecast near Bahía Blanca (WHI-907 part 4).
 *
 * `api/smn-wrf-sync.py` stores the grid cells around Bahía Blanca in the
 * `wind_forecast` table. This module decides which stored row describes a
 * point right now. Wind changes more from one hour to the next than between
 * two neighbouring 4 km cells, so the valid hour closest to "now" wins first,
 * then the nearest cell, then the newest model run.
 */
import { haversineKm } from "@/lib/geo";

export interface ForecastRow {
  run_at: string;
  valid_at: string;
  lat: number;
  lng: number;
  /** Direction the wind blows FROM, degrees. */
  wind_from_deg: number;
  wind_kmh: number;
  temp_c: number | null;
  rh_pct: number | null;
}

// Must match BAHIA_BLANCA and RADIUS_KM in api/smn-wrf-sync.py: the sync only
// stores cells this close, so asking the database about anywhere else is a
// round trip that always comes back empty.
export const SMN_CENTER = { lat: -38.72, lng: -62.27 } as const;
export const SMN_RADIUS_KM = 30;

export function smnCovers(lat: number, lng: number): boolean {
  return haversineKm(lat, lng, SMN_CENTER.lat, SMN_CENTER.lng) <= SMN_RADIUS_KM;
}

export function pickForecastRow(
  rows: ForecastRow[],
  lat: number,
  lng: number,
  at: Date,
  maxKm = 10,
  maxMinutes = 60
): ForecastRow | null {
  let best: { row: ForecastRow; minutes: number; km: number; run: number } | null = null;

  for (const row of rows) {
    const validMs = Date.parse(row.valid_at);
    if (Number.isNaN(validMs)) continue;
    const minutes = Math.abs(validMs - at.getTime()) / 60_000;
    if (minutes > maxMinutes) continue;
    const km = haversineKm(lat, lng, row.lat, row.lng);
    if (km > maxKm) continue;
    const run = Date.parse(row.run_at);

    const better =
      !best ||
      minutes < best.minutes ||
      (minutes === best.minutes && (km < best.km || (km === best.km && run > best.run)));
    if (better) best = { row, minutes, km, run };
  }

  return best?.row ?? null;
}
