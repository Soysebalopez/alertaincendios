import { describe, expect, it } from "vitest";
import { pickForecastRow, smnCovers, type ForecastRow } from "@/lib/wind-forecast";

/**
 * WHI-907 part 4 — near Bahía Blanca the wind comes from the SMN WRF 4 km
 * forecast stored in `wind_forecast`. Which row to use: the valid hour closest
 * to "now" first (wind changes more hour to hour than between neighbouring
 * 4 km cells), then the nearest grid cell, then the newest model run.
 */
const BAHIA = { lat: -38.72, lng: -62.27 };
const AT = new Date("2026-09-14T15:20:00Z");
// 1° of latitude ≈ 111.2 km.
const KM = 1 / 111.2;

function row(over: Partial<ForecastRow> = {}): ForecastRow {
  return {
    run_at: "2026-09-14T12:00:00Z",
    valid_at: "2026-09-14T15:00:00Z",
    lat: BAHIA.lat,
    lng: BAHIA.lng,
    wind_from_deg: 315,
    wind_kmh: 40,
    temp_c: 30,
    rh_pct: 20,
    ...over,
  };
}

describe("pickForecastRow", () => {
  it("prefers the valid hour closest to now over a nearer cell at another hour", () => {
    const sameHourFarther = row({ lat: BAHIA.lat - 5 * KM, wind_kmh: 11 });
    const nextHourNearer = row({ valid_at: "2026-09-14T16:00:00Z", lat: BAHIA.lat - 0.5 * KM, wind_kmh: 22 });
    expect(pickForecastRow([nextHourNearer, sameHourFarther], BAHIA.lat, BAHIA.lng, AT)?.wind_kmh).toBe(11);
  });

  it("within that hour, takes the nearest grid cell", () => {
    const at3km = row({ lat: BAHIA.lat - 3 * KM, wind_kmh: 33 });
    const at1km = row({ lat: BAHIA.lat - 1 * KM, wind_kmh: 44 });
    expect(pickForecastRow([at3km, at1km], BAHIA.lat, BAHIA.lng, AT)?.wind_kmh).toBe(44);
  });

  it("for the same cell and hour, takes the newest model run", () => {
    const older = row({ run_at: "2026-09-14T00:00:00Z", wind_kmh: 10 });
    const newer = row({ run_at: "2026-09-14T12:00:00Z", wind_kmh: 50 });
    expect(pickForecastRow([newer, older], BAHIA.lat, BAHIA.lng, AT)?.wind_kmh).toBe(50);
  });

  it("null when the nearest cell is farther than maxKm", () => {
    expect(pickForecastRow([row({ lat: BAHIA.lat - 12 * KM })], BAHIA.lat, BAHIA.lng, AT)).toBeNull();
  });

  it("null when every row is more than maxMinutes away from now", () => {
    expect(pickForecastRow([row({ valid_at: "2026-09-14T13:00:00Z" })], BAHIA.lat, BAHIA.lng, AT)).toBeNull();
  });

  it("null without rows", () => {
    expect(pickForecastRow([], BAHIA.lat, BAHIA.lng, AT)).toBeNull();
  });
});

describe("smnCovers", () => {
  it("covers Bahía Blanca and its surroundings", () => {
    expect(smnCovers(BAHIA.lat, BAHIA.lng)).toBe(true);
    expect(smnCovers(BAHIA.lat - 20 * KM, BAHIA.lng)).toBe(true);
  });

  it("does not cover the rest of the country, so no database round trip there", () => {
    expect(smnCovers(-34.6, -58.38)).toBe(false);
    expect(smnCovers(BAHIA.lat - 40 * KM, BAHIA.lng)).toBe(false);
  });
});
