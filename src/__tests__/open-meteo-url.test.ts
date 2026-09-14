import { describe, expect, it } from "vitest";
import { openMeteoUrl } from "@/lib/open-meteo";

/**
 * WHI-907 part 1 — the free Open-Meteo plan forbids commercial use. Setting
 * OPEN_METEO_API_KEY must switch every call to the paid (customer) hosts with
 * `apikey=`, with no code change. Without the key, behaviour stays as today.
 */
describe("openMeteoUrl", () => {
  it("uses the free host without a key", () => {
    const u = new URL(openMeteoUrl("forecast", { latitude: -38.72, current: "wind_speed_10m" }, null));
    expect(u.host).toBe("api.open-meteo.com");
    expect(u.pathname).toBe("/v1/forecast");
    expect(u.searchParams.get("apikey")).toBeNull();
    expect(u.searchParams.get("latitude")).toBe("-38.72");
  });

  it("switches to the customer host and appends apikey when a key is set", () => {
    const u = new URL(openMeteoUrl("forecast", { latitude: 1 }, "abc"));
    expect(u.host).toBe("customer-api.open-meteo.com");
    expect(u.searchParams.get("apikey")).toBe("abc");
  });

  it("trims the key (Vercel appends whitespace) and treats blank as no key", () => {
    expect(new URL(openMeteoUrl("forecast", {}, "  abc \n")).searchParams.get("apikey")).toBe("abc");
    expect(new URL(openMeteoUrl("forecast", {}, "   ")).host).toBe("api.open-meteo.com");
  });

  it.each([
    ["air-quality", "air-quality-api.open-meteo.com", "customer-air-quality-api.open-meteo.com", "/v1/air-quality"],
    ["archive", "archive-api.open-meteo.com", "customer-archive-api.open-meteo.com", "/v1/archive"],
    ["geocoding", "geocoding-api.open-meteo.com", "customer-geocoding-api.open-meteo.com", "/v1/search"],
  ] as const)("maps %s to its free and customer hosts", (api, free, customer, pathname) => {
    expect(new URL(openMeteoUrl(api, {}, null)).host).toBe(free);
    const paid = new URL(openMeteoUrl(api, {}, "k"));
    expect(paid.host).toBe(customer);
    expect(paid.pathname).toBe(pathname);
  });

  it("keeps comma-separated variable lists intact", () => {
    const u = new URL(openMeteoUrl("forecast", { current: "wind_speed_10m,wind_direction_10m" }, null));
    expect(u.searchParams.get("current")).toBe("wind_speed_10m,wind_direction_10m");
  });
});
