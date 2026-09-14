import { describe, expect, it } from "vitest";
import {
  csiroConditionsMet,
  deadFuelMoisturePct,
  formatFrontEta,
  grassFireFrontEtaMinutes,
} from "@/lib/fire-spread";

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
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: 15 })).toBe(120);
  });

  it("returns null when the wind is 30 km/h or less", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 30, tempC: 35, rhPct: 15 })).toBeNull();
  });

  it("returns null when the fuel is too moist (25 °C, 50% RH)", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 25, rhPct: 50 })).toBeNull();
  });

  it("returns null when humidity is unknown — never invents a number", () => {
    expect(csiroConditionsMet({ windKmh: 40, tempC: 35, rhPct: null })).toBe(false);
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: null })).toBeNull();
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
