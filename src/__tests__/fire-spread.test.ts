import { describe, expect, it } from "vitest";
import {
  alertFrontEtaMinutes,
  csiroConditionsMet,
  deadFuelMoisturePct,
  formatFrontEta,
  grassFireFrontEtaMinutes,
  isGrassCuringSeason,
} from "@/lib/fire-spread";

// The rule assumes cured grass: grassland fires, November to April.
const GRASS = { grassland: true, at: new Date("2026-12-10T15:00:00Z") };

/**
 * WHI-907 part 5 — CSIRO PyroPage 33 (2022): grassfire forward spread ≈ 20% of
 * the 10-m wind, valid with wind > 30 km/h and dead fuel moisture < 6%. Dead
 * fuel moisture from Cheney et al. (1998): MC = 9.58 − 0.205·T + 0.138·RH.
 */
describe("deadFuelMoisturePct", () => {
  it("reproduces the 6% line of the PyroPage chart", () => {
    expect(deadFuelMoisturePct(30, 18)).toBeCloseTo(5.91, 2);
    expect(deadFuelMoisturePct(45, 41)).toBeCloseTo(6.01, 2);
  });
});

describe("grassFireFrontEtaMinutes", () => {
  it("40 km/h, 35 °C, 15% RH, 16 km away → 120 min", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: 15, ...GRASS })).toBe(120);
  });

  it("returns null when the wind is 30 km/h or less", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 30, tempC: 35, rhPct: 15, ...GRASS })).toBeNull();
  });

  it("returns null when the fuel is too moist (25 °C, 50% RH)", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 25, rhPct: 50, ...GRASS })).toBeNull();
  });

  it("returns null when humidity is unknown — never invents a number", () => {
    expect(csiroConditionsMet({ windKmh: 40, tempC: 35, rhPct: null })).toBe(false);
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: null, ...GRASS })).toBeNull();
  });

  it("a forest fire gets no grassland estimate, whatever the weather", () => {
    expect(
      grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: 15, ...GRASS, grassland: false })
    ).toBeNull();
  });

  it("outside the curing season (July) there is no estimate", () => {
    expect(
      grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: 15, grassland: true, at: new Date("2026-07-15T15:00:00Z") })
    ).toBeNull();
  });
});

describe("alertFrontEtaMinutes (the front line of a Telegram alert)", () => {
  const DRY_WIND = { windSpeed: 40, temperature: 35, relativeHumidity: 15 };
  const SUMMER = new Date("2026-12-10T15:00:00Z");

  it("a grassland fire pushed toward the subscriber gets the estimate", () => {
    expect(alertFrontEtaMinutes({ headsToward: true, distKm: 16, wind: DRY_WIND, at: SUMMER })).toBe(120);
  });

  it("a fire inside a forest zone never gets it (every bot alert today)", () => {
    expect(
      alertFrontEtaMinutes({ headsToward: true, distKm: 16, wind: DRY_WIND, forestZone: "any-forest-zone", at: SUMMER })
    ).toBeNull();
  });

  it("no estimate when the wind pushes the fire away", () => {
    expect(alertFrontEtaMinutes({ headsToward: false, distKm: 16, wind: DRY_WIND, at: SUMMER })).toBeNull();
  });

  it("no estimate in winter", () => {
    expect(
      alertFrontEtaMinutes({ headsToward: true, distKm: 16, wind: DRY_WIND, at: new Date("2026-07-15T15:00:00Z") })
    ).toBeNull();
  });
});

describe("isGrassCuringSeason (November to April, Argentina time)", () => {
  it.each([
    ["2026-11-01T03:00:00Z", true], // 1 Nov 00:00 in Argentina
    ["2026-11-01T02:59:00Z", false], // 31 Oct 23:59 in Argentina
    ["2027-01-15T12:00:00Z", true],
    ["2027-04-30T23:00:00Z", true], // 30 Apr 20:00 in Argentina
    ["2027-05-01T03:00:00Z", false], // 1 May 00:00 in Argentina
  ])("%s → %s", (iso, expected) => {
    expect(isGrassCuringSeason(new Date(iso))).toBe(expected);
  });
});

describe("formatFrontEta", () => {
  it.each([
    [45, "~45 min"],
    [120, "~2 h"],
    [150, "~2 h 30 min"],
  ])("%i min → %s", (minutes, text) => {
    expect(formatFrontEta(minutes)).toBe(text);
  });

  it("null stays null", () => {
    expect(formatFrontEta(null)).toBeNull();
  });
});
