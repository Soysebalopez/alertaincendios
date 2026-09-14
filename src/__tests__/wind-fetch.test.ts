import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWind } from "@/lib/wind";

/**
 * WHI-907 part 5 — the CSIRO grassfire rule needs relative humidity to decide
 * whether it applies. fetchWind must return it, and must say "unknown" (null)
 * instead of inventing a default when Open-Meteo does not provide it.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(body: unknown, onRequest?: (url: string) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      onRequest?.(String(input));
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

describe("fetchWind — relative humidity", () => {
  it("asks Open-Meteo for relative_humidity_2m", async () => {
    let requested = "";
    respondWith({ current: {} }, (url) => {
      requested = url;
    });
    await fetchWind(-38.72, -62.27);
    expect(new URL(requested).searchParams.get("current")?.split(",")).toContain("relative_humidity_2m");
  });

  it("returns the humidity Open-Meteo reports", async () => {
    respondWith({
      current: { wind_speed_10m: 40, wind_direction_10m: 315, temperature_2m: 35, relative_humidity_2m: 15 },
    });
    expect(await fetchWind(-38.72, -62.27)).toMatchObject({
      windSpeed: 40,
      windDirection: 315,
      temperature: 35,
      relativeHumidity: 15,
    });
  });

  it("missing humidity is null, never a made-up default", async () => {
    respondWith({ current: { wind_speed_10m: 40, wind_direction_10m: 315, temperature_2m: 35 } });
    expect((await fetchWind(-38.72, -62.27)).relativeHumidity).toBeNull();
  });

  it("network failure leaves humidity unknown (null)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect((await fetchWind(-38.72, -62.27)).relativeHumidity).toBeNull();
  });
});
