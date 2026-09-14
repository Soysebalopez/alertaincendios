import { describe, expect, it } from "vitest";
import { airportWindSummary, lightningSummary } from "@/lib/bahia-panels";

/**
 * WHI-907 part 9 — two panels on the Bahía Blanca page read our own tables:
 * recent GOES-19 GLM lightning and the wind measured at the airport (METAR
 * SAZB). Neither may show a reassuring number built on stale data.
 */
const NOW = new Date("2026-09-14T18:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const BAHIA = { lat: -38.7196, lng: -62.2724 };

describe("lightningSummary", () => {
  it("says nothing without a recent GLM heartbeat: a dead sync looks like a quiet sky", () => {
    expect(lightningSummary({ flashes: [], heartbeatAt: null, now: NOW })).toBeNull();
    expect(lightningSummary({ flashes: [], heartbeatAt: minutesAgo(30), now: NOW })).toBeNull();
  });

  it("with fresh data and no flashes, zero is a real zero", () => {
    expect(lightningSummary({ flashes: [], heartbeatAt: minutesAgo(3), now: NOW })).toEqual({
      count: 0,
      nearestKm: null,
      minutesSinceLatest: null,
    });
  });

  it("counts flashes within 30 km in the last 3 hours, with the nearest distance and the latest time", () => {
    const flashes = [
      { flash_at: minutesAgo(20), lat: BAHIA.lat + 0.09, lng: BAHIA.lng }, // ~10 km
      { flash_at: minutesAgo(50), lat: BAHIA.lat + 0.18, lng: BAHIA.lng }, // ~20 km
      { flash_at: minutesAgo(10), lat: BAHIA.lat + 0.45, lng: BAHIA.lng }, // ~50 km: too far
      { flash_at: minutesAgo(240), lat: BAHIA.lat, lng: BAHIA.lng }, // 4 h ago: too old
    ];
    expect(lightningSummary({ flashes, heartbeatAt: minutesAgo(3), now: NOW })).toEqual({
      count: 2,
      nearestKm: 10,
      minutesSinceLatest: 20,
    });
  });
});

describe("airportWindSummary", () => {
  const observation = {
    observed_at: minutesAgo(40),
    wind_from_deg: 330,
    wind_kmh: 25.9,
    gust_kmh: 44.4,
    variable: false,
  };

  it("nothing to show without an observation from the last 3 hours", () => {
    expect(airportWindSummary(null, NOW)).toBeNull();
    expect(airportWindSummary({ ...observation, observed_at: minutesAgo(240) }, NOW)).toBeNull();
  });

  it("says where it blows from, how hard, and how long ago it was measured", () => {
    expect(airportWindSummary(observation, NOW)).toEqual({
      minutesAgo: 40,
      windKmh: 26,
      gustKmh: 44,
      fromLabel: "Nor-noroeste",
    });
  });

  it("variable wind has no direction", () => {
    expect(
      airportWindSummary({ ...observation, wind_from_deg: null, variable: true, gust_kmh: null }, NOW)
    ).toMatchObject({ fromLabel: "variable", gustKmh: null });
  });
});
