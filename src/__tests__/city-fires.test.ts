import { describe, expect, it } from "vitest";
import { showsFire } from "@/lib/city-fires";

/**
 * WHI-907 — Bahía Blanca lies in no forest zone (the 7 zones are forests:
 * Andino Patagónico, Yungas, Misiones, Espinal, Córdoba, Chaco, Tierra del
 * Fuego), so the forest-only filter every city page uses would hide a
 * grassfire 20 km from the city. Its page shows every vegetation fire instead,
 * still without industrial flares such as Ingeniero White's petrochemical
 * complex (VIIRS type 2).
 */
describe("showsFire", () => {
  it("forest (every city page): only fires inside a forest zone, as before", () => {
    expect(showsFire({ type: 0, forestZone: "yungas" }, "forest")).toBe(true);
    expect(showsFire({ type: 0 }, "forest")).toBe(false);
  });

  it("vegetation (Bahía Blanca): a grassfire outside every forest zone is shown", () => {
    expect(showsFire({ type: 0 }, "vegetation")).toBe(true);
  });

  it("vegetation never shows industrial flares, volcanoes or offshore sources", () => {
    expect(showsFire({ type: 2 }, "vegetation")).toBe(false);
    expect(showsFire({ type: 1 }, "vegetation")).toBe(false);
    expect(showsFire({ type: 3 }, "vegetation")).toBe(false);
  });

  it("a fire without a type counts as vegetation, as /api/fires counts it", () => {
    expect(showsFire({}, "vegetation")).toBe(true);
  });
});
