import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDryConditions } from "@/lib/lightning";

/**
 * WHI-907 part 2 — with real GLM flashes, humidity and last-hour rain decide
 * whether the storm is dry. A missing reading must stay unknown (null): a
 * default like 50% or 0 mm could make a storm look dry when we simply don't know.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

describe("fetchDryConditions", () => {
  it("returns humidity and last-hour rain from Open-Meteo", async () => {
    respondWith({ current: { relative_humidity_2m: 35, precipitation: 0.2 } });
    expect(await fetchDryConditions(-38.72, -62.27)).toEqual({ humidity: 35, recentRainMm: 0.2 });
  });

  it("missing readings are null, never defaults", async () => {
    respondWith({ current: {} });
    expect(await fetchDryConditions(-38.72, -62.27)).toEqual({ humidity: null, recentRainMm: null });
  });

  it("an HTTP error leaves both unknown", async () => {
    respondWith({ reason: "boom" }, 500);
    expect(await fetchDryConditions(-38.72, -62.27)).toEqual({ humidity: null, recentRainMm: null });
  });

  it("a network failure leaves both unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect(await fetchDryConditions(-38.72, -62.27)).toEqual({ humidity: null, recentRainMm: null });
  });
});
