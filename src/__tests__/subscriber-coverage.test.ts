import { describe, it, expect } from "vitest";
import { isInArgentina } from "@/lib/argentina-polygon";

/**
 * The subscriber coverage gate reuses the same polygon that trims FIRMS fires.
 * These cases guard the gate itself: a real Argentine subscriber must never be
 * turned away, and a location the service cannot cover must never be accepted.
 */

describe("subscriber coverage gate", () => {
  it.each([
    ["Bahía Blanca", -38.717, -62.272],
    ["CABA", -34.603, -58.381],
    ["Córdoba", -31.42, -64.183],
    ["Mendoza", -32.889, -68.845],
    ["Bariloche", -41.135, -71.309],
    ["Neuquén", -38.951, -68.059],
    ["Salta", -24.789, -65.41],
    ["Ushuaia", -54.801, -68.303],
    ["Río Grande", -53.786, -67.71],
    ["Posadas", -27.367, -55.896],
  ])("accepts %s", (_city, lat, lng) => {
    expect(isInArgentina(lat, lng)).toBe(true);
  });

  it.each([
    ["Càlig, España", 40.458, 0.354],
    ["Madrid, España", 40.417, -3.704],
    ["Montevideo, Uruguay", -34.901, -56.164],
    ["São Paulo, Brasil", -23.551, -46.633],
  ])("rejects %s", (_place, lat, lng) => {
    expect(isInArgentina(lat, lng)).toBe(false);
  });
});
