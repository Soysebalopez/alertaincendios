import { describe, expect, it } from "vitest";
import { showsFire } from "@/lib/city-fires";
import { isStaticHeatSource } from "@/lib/static-heat-sources";

/**
 * WHI-907 — the FIRMS near-real-time feed (VIIRS_SNPP_NRT) has no "type"
 * column, so every detection arrives as vegetation. Around Bahía Blanca that
 * would list industrial flares as active fires and draw smoke cones over the
 * city. The sites come from the FIRMS archive, which does classify static
 * land sources (type 2): in 2023–2024, within 60 km of Bahía Blanca, 147
 * detections clustered in two sites.
 */
describe("isStaticHeatSource", () => {
  it("the Ingeniero White petrochemical complex (99 archive flares)", () => {
    expect(isStaticHeatSource(-38.7752, -62.289)).toBe(true);
    // Outer flare cell, ~1.8 km from the site's centre.
    expect(isStaticHeatSource(-38.79, -62.28)).toBe(true);
  });

  it("the second industrial site, northwest of the city (48 archive flares)", () => {
    expect(isStaticHeatSource(-38.6852, -62.4146)).toBe(true);
  });

  it("a fire a few kilometres away is not a static source", () => {
    // Bahía Blanca centre: 6 km from the complex, 13 km from the other site.
    expect(isStaticHeatSource(-38.72, -62.27)).toBe(false);
    expect(isStaticHeatSource(-38.6, -62.2)).toBe(false);
  });
});

describe("showsFire on the Bahía Blanca page", () => {
  it("hides a detection on a known flare site, although the feed calls it vegetation", () => {
    expect(showsFire({ type: 0, latitude: -38.7752, longitude: -62.289 }, "vegetation")).toBe(false);
  });

  it("keeps a vegetation fire elsewhere", () => {
    expect(showsFire({ type: 0, latitude: -38.6, longitude: -62.2 }, "vegetation")).toBe(true);
  });
});
