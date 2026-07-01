import { describe, expect, it } from "vitest";
import { calculateDispersion, type DispersionInput } from "@/lib/dispersion";

/**
 * Sanity tests for the Gaussian plume cone geometry (audit A8).
 *
 * The plume travels DOWNWIND: wind direction is where the wind comes FROM
 * (compass, 0 = N), so a point on the downwind side must be flagged, and a
 * point on the upwind side must not. Source sits roughly mid-Argentina.
 */

const SOURCE: [number, number] = [-64.0, -34.0]; // [lng, lat]

function baseInput(overrides: Partial<DispersionInput> = {}): DispersionInput {
  return {
    source: SOURCE,
    windDirection: 0, // wind FROM the north → plume blows toward the south
    windSpeed: 30,
    windGusts: 45,
    eventType: "fuga_gas",
    durationMinutes: 120,
    nearbyZones: [],
    ...overrides,
  };
}

describe("calculateDispersion — plume cone geometry", () => {
  it("flags a point downwind (south, wind from north) as affected", () => {
    // Wind from the north → smoke goes south → lower latitude. ~17 km south,
    // inside the low ring (≈25 km with gusts) and on the cone axis.
    const downwind = { name: "Sur", lat: -34.15, lng: -64.0 };
    const res = calculateDispersion(baseInput({ nearbyZones: [downwind] }));
    const zone = res.affectedZones.find((z) => z.name === "Sur");
    expect(zone?.concentrationLevel).not.toBe("none");
  });

  it("does NOT flag a point upwind (north) as affected", () => {
    // Directly opposite the plume direction → outside the cone, even if close.
    const upwind = { name: "Norte", lat: -33.85, lng: -64.0 };
    const res = calculateDispersion(baseInput({ nearbyZones: [upwind] }));
    const zone = res.affectedZones.find((z) => z.name === "Norte");
    expect(zone?.concentrationLevel).toBe("none");
  });

  it("returns null ETA when wind is calm (no dispersion)", () => {
    const res = calculateDispersion(baseInput({ windSpeed: 0, windGusts: 0 }));
    for (const plume of res.plumes) {
      expect(plume.etaMinutes).toBeNull();
    }
  });
});
