import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * WHI-907 part 11 — GET /api/fire-projection?lat=&lng=&confirmed=1 gives the
 * map the smoke sector (and, for a confirmed fire in CSIRO conditions, the
 * front isochrones) for one fire, using the best wind available there.
 */
const fetchWind = vi.fn();
vi.mock("@/lib/wind", () => ({ fetchWind: (...args: unknown[]) => fetchWind(...args) }));
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: async () => ({ ok: true }),
  clientIp: () => "203.0.113.1",
  isInternalCall: () => false,
  rateLimitHeaders: () => ({}),
}));

import { GET } from "@/app/api/fire-projection/route";

type Body = { type: string; features: Array<{ properties: Record<string, unknown> }> };
const request = (query: string) => new NextRequest(`https://x/api/fire-projection?${query}`);

beforeEach(() => {
  // 40 km/h, 35 °C, 15% RH: the CSIRO grassfire rule applies.
  fetchWind.mockReset().mockResolvedValue({
    windSpeed: 40,
    windDirection: 315,
    temperature: 35,
    relativeHumidity: 15,
    source: "smn-wrf",
  });
});

describe("GET /api/fire-projection", () => {
  it("rejects missing or impossible coordinates without asking for wind", async () => {
    expect((await GET(request("lat=-38.6"))).status).toBe(400);
    expect((await GET(request("lat=-95&lng=-62.4"))).status).toBe(400);
    expect((await GET(request("lat=abc&lng=-62.4"))).status).toBe(400);
    expect(fetchWind).not.toHaveBeenCalled();
  });

  it("a confirmed fire gets smoke plus four front isochrones, labelled with the wind source", async () => {
    const res = await GET(request("lat=-38.6&lng=-62.4&confirmed=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.type).toBe("FeatureCollection");
    expect(body.features.map((f) => f.properties.kind)).toEqual(["smoke", "front", "front", "front", "front"]);
    expect(body.features[0].properties.wind_source).toBe("smn-wrf");
    expect(fetchWind).toHaveBeenCalledWith(-38.6, -62.4);
  });

  it("without confirmed=1 it is only a possible fire: smoke, no front", async () => {
    const body = (await (await GET(request("lat=-38.6&lng=-62.4"))).json()) as Body;
    expect(body.features.map((f) => f.properties.kind)).toEqual(["smoke"]);
    expect(body.features[0].properties.possible_fire).toBe(true);
  });

  it("draws nothing when no real wind is available — fallback values are made up", async () => {
    fetchWind.mockResolvedValueOnce({
      windSpeed: 10,
      windDirection: 180,
      temperature: 20,
      relativeHumidity: null,
      source: "fallback",
    });
    const res = await GET(request("lat=-38.6&lng=-62.4&confirmed=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body & { unavailable?: string };
    expect(body.features).toEqual([]);
    expect(body.unavailable).toBe("wind_unavailable");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("is cacheable at the edge for 10 minutes", async () => {
    const res = await GET(request("lat=-38.6&lng=-62.4&confirmed=1"));
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=600");
  });
});
