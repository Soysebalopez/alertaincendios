import { describe, expect, it } from "vitest";
import { bearingDegrees, haversineKm } from "@/lib/geo";
import {
  destinationPoint,
  frontIsochrone,
  lengthToBreadth,
  projectFire,
  smokeSector,
} from "@/lib/fire-projection";

/**
 * WHI-907 part 11 — the cone on the map.
 *
 * Two separate things, never merged: where the SMOKE goes (a sector downwind)
 * and how far the FIRE FRONT could advance (CSIRO 20% rule, grass ellipse with
 * the fire at its rear focus). Wind direction is where the wind blows FROM.
 */
const ORIGIN = { lat: -38.6, lng: -62.4 };

describe("lengthToBreadth (Canadian FBP O-1 grass)", () => {
  it.each([
    [5, 2.32],
    [30, 5.33],
    [50, 6.76],
  ])("wind %i km/h → length/breadth ≈ %f", (wind, ratio) => {
    expect(lengthToBreadth(wind)).toBeCloseTo(ratio, 1);
  });

  it("calm wind burns as a circle", () => {
    expect(lengthToBreadth(0.5)).toBe(1);
  });
});

describe("destinationPoint", () => {
  it("10 km due south lowers latitude by ~0.09°", () => {
    const [lat, lng] = destinationPoint(ORIGIN.lat, ORIGIN.lng, 180, 10);
    expect(lat).toBeCloseTo(ORIGIN.lat - 0.0899, 3);
    expect(lng).toBeCloseTo(ORIGIN.lng, 6);
  });
});

describe("smokeSector", () => {
  const axisPoint = () => {
    const ring = smokeSector(ORIGIN, 315, 40, 60, 15).geometry.coordinates[0];
    const [lng, lat] = ring[Math.floor(ring.length / 2)];
    return { lat, lng };
  };

  it("points downwind: wind from the northwest → smoke toward the southeast", () => {
    const { lat, lng } = axisPoint();
    const bearing = bearingDegrees(ORIGIN.lat, ORIGIN.lng, lat, lng);
    expect(bearing).toBeGreaterThan(130);
    expect(bearing).toBeLessThan(140);
  });

  it("reaches wind speed × time along its axis", () => {
    const { lat, lng } = axisPoint();
    expect(haversineKm(ORIGIN.lat, ORIGIN.lng, lat, lng)).toBeCloseTo(40, 0);
  });
});

describe("frontIsochrone", () => {
  it("head reaches 20% of wind × time, with the fire at the rear of the ellipse", () => {
    const ring = frontIsochrone(ORIGIN, 315, 40, 60).geometry.coordinates[0];
    const distances = ring.map(([lng, lat]) => haversineKm(ORIGIN.lat, ORIGIN.lng, lat, lng));
    expect(Math.max(...distances)).toBeCloseTo(8, 0);
    expect(Math.min(...distances)).toBeLessThan(1);
  });
});

describe("projectFire", () => {
  const base = {
    origin: ORIGIN,
    windFromDeg: 315,
    issuedAt: new Date("2026-11-20T18:00:00.000Z"),
    windSource: "open-meteo",
  };
  const kinds = (fc: ReturnType<typeof projectFire>) => fc.features.map((f) => f.properties.kind);

  it("draws smoke but no fire front when the CSIRO conditions do not hold", () => {
    const fc = projectFire({ ...base, windKmh: 20, tempC: 22, rhPct: 60, confirmed: true });
    expect(kinds(fc)).toContain("smoke");
    expect(kinds(fc)).not.toContain("front");
  });

  it("draws fire front isochrones at 30/60/120/180 min when they hold", () => {
    const fc = projectFire({ ...base, windKmh: 40, tempC: 35, rhPct: 15, confirmed: true });
    const etas = fc.features.filter((f) => f.properties.kind === "front").map((f) => f.properties.eta_minutes);
    expect(etas).toEqual([30, 60, 120, 180]);
  });

  it("never draws a front with unknown humidity", () => {
    const fc = projectFire({ ...base, windKmh: 40, tempC: 35, rhPct: null, confirmed: true });
    expect(kinds(fc)).not.toContain("front");
  });

  it("an unconfirmed GOES detection only gets smoke, labelled as a possible fire", () => {
    const fc = projectFire({ ...base, windKmh: 40, tempC: 35, rhPct: 15, confirmed: false });
    expect(kinds(fc).every((kind) => kind === "smoke")).toBe(true);
    expect(fc.features[0].properties.possible_fire).toBe(true);
  });

  it("calm wind gets a single 'variable' circle instead of a cone", () => {
    const fc = projectFire({ ...base, windKmh: 5, tempC: 35, rhPct: 15, confirmed: true });
    expect(kinds(fc)).toEqual(["variable"]);
  });

  it("every shape expires one hour after it was issued", () => {
    const fc = projectFire({ ...base, windKmh: 40, tempC: 35, rhPct: 15, confirmed: true });
    expect(fc.features.every((f) => f.properties.valid_to === "2026-11-20T19:00:00.000Z")).toBe(true);
  });
});
