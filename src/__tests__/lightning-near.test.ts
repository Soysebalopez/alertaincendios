import { describe, expect, it } from "vitest";
import {
  GLM_NEAR_RADIUS_KM,
  flashesNear,
  glmDataIsFresh,
  isDryLightningRisk,
} from "@/lib/lightning-near";

/**
 * WHI-907 part 2 — real lightning (GOES-19 GLM) instead of a thunderstorm
 * forecast. GLM locates a flash within ~8–14 km, so "near" uses a 30 km radius.
 * A dry thunderstorm needs a real flash nearby AND known dry conditions: with
 * unknown humidity we do not claim the storm is dry.
 */
const BAHIA = { lat: -38.72, lng: -62.27 };

describe("flashesNear", () => {
  it("uses a 30 km radius by default", () => {
    expect(GLM_NEAR_RADIUS_KM).toBe(30);
  });

  it("keeps flashes inside the radius, nearest first, with their distance", () => {
    const flashes = [
      { flashAt: "2026-11-20T18:00:00.000Z", lat: BAHIA.lat + 0.18, lng: BAHIA.lng }, // ~20 km
      { flashAt: "2026-11-20T18:00:05.000Z", lat: BAHIA.lat + 0.45, lng: BAHIA.lng }, // ~50 km
      { flashAt: "2026-11-20T18:00:10.000Z", lat: BAHIA.lat + 0.09, lng: BAHIA.lng }, // ~10 km
    ];
    const near = flashesNear(flashes, BAHIA.lat, BAHIA.lng);
    expect(near.map((f) => f.flashAt)).toEqual(["2026-11-20T18:00:10.000Z", "2026-11-20T18:00:00.000Z"]);
    expect(near[0].distKm).toBeCloseTo(10, 0);
  });

  it("returns an empty list when nothing is close", () => {
    expect(flashesNear([], BAHIA.lat, BAHIA.lng)).toEqual([]);
  });
});

describe("isDryLightningRisk", () => {
  it("real flash nearby + dry air + no rain → risk", () => {
    expect(isDryLightningRisk({ flashesNearby: 2, humidity: 40, recentRainMm: 0 })).toBe(true);
  });

  it("humid air (≥ 60%) → no risk", () => {
    expect(isDryLightningRisk({ flashesNearby: 2, humidity: 70, recentRainMm: 0 })).toBe(false);
  });

  it("rain (≥ 0.5 mm) → no risk", () => {
    expect(isDryLightningRisk({ flashesNearby: 2, humidity: 40, recentRainMm: 1.2 })).toBe(false);
  });

  it("no flashes → no risk", () => {
    expect(isDryLightningRisk({ flashesNearby: 0, humidity: 20, recentRainMm: 0 })).toBe(false);
  });

  it("unknown humidity or rain → no claim of a dry storm", () => {
    expect(isDryLightningRisk({ flashesNearby: 2, humidity: null, recentRainMm: 0 })).toBe(false);
    expect(isDryLightningRisk({ flashesNearby: 2, humidity: 40, recentRainMm: null })).toBe(false);
  });
});

describe("glmDataIsFresh", () => {
  const now = new Date("2026-11-20T18:30:00.000Z");

  it("a sync 10 minutes ago is fresh", () => {
    expect(glmDataIsFresh("2026-11-20T18:20:00.000Z", now)).toBe(true);
  });

  it("a sync 20 minutes ago is stale", () => {
    expect(glmDataIsFresh("2026-11-20T18:10:00.000Z", now)).toBe(false);
  });

  it("no sync at all is stale", () => {
    expect(glmDataIsFresh(null, now)).toBe(false);
  });
});
