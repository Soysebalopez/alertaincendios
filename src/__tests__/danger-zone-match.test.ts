import { describe, it, expect } from "vitest";
import { findDangerZone, type DangerZoneBox } from "@/lib/danger-zone-match";

// bbox = [south, north, west, east]
const ZONES: DangerZoneBox[] = [
  { id: "tdf-norte-estepa", name: "Estepa Fueguina Norte", bbox: [-54.0, -53.0, -68.5, -67.0] },
  { id: "tdf-sur-bosque", name: "Bosque Fueguino Sur", bbox: [-55.0, -54.0, -69.0, -67.5] },
];

describe("findDangerZone", () => {
  it("matches a point inside a zone bbox", () => {
    expect(findDangerZone(-53.5, -67.7, ZONES)?.id).toBe("tdf-norte-estepa");
  });
  it("picks the correct zone for the south point", () => {
    expect(findDangerZone(-54.8, -68.3, ZONES)?.id).toBe("tdf-sur-bosque");
  });
  it("matches within 5km buffer of a bbox edge", () => {
    // just north of the norte bbox (north edge -53.0), ~3km
    expect(findDangerZone(-52.975, -67.7, ZONES)?.id).toBe("tdf-norte-estepa");
  });
  it("returns null when far from every zone", () => {
    expect(findDangerZone(-34.6, -58.4, ZONES)).toBeNull(); // Buenos Aires
  });
});
