import { describe, it, expect, afterEach, vi } from "vitest";
import { reverseGeocode } from "@/lib/geocode";

// Shape of the BigDataCloud reverse-geocode-client response, trimmed to the
// fields we read. Real payload for Bahía Blanca (-38.682, -62.276).
const BAHIA_BLANCA = {
  countryCode: "AR",
  principalSubdivision: "Buenos Aires",
  city: "Partido de Bahía Blanca",
  locality: "Bahía Blanca",
};

function stubFetchJson(payload: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => payload }))
  );
}

describe("reverseGeocode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves coordinates to a locality and province", async () => {
    stubFetchJson(BAHIA_BLANCA);

    const result = await reverseGeocode(-38.682, -62.276);

    expect(result).toEqual({
      lat: -38.682,
      lng: -62.276,
      name: "Bahía Blanca",
      admin1: "Buenos Aires",
    });
  });

  it("falls back to the city field when locality is empty", async () => {
    stubFetchJson({ ...BAHIA_BLANCA, locality: "" });

    const result = await reverseGeocode(-38.682, -62.276);

    expect(result?.name).toBe("Partido de Bahía Blanca");
  });

  it("returns null when the service names no place", async () => {
    stubFetchJson({ countryCode: "", principalSubdivision: "", city: "", locality: "" });

    expect(await reverseGeocode(-38.682, -62.276)).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    stubFetchJson(BAHIA_BLANCA, false);

    expect(await reverseGeocode(-38.682, -62.276)).toBeNull();
  });

  it("returns null when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    expect(await reverseGeocode(-38.682, -62.276)).toBeNull();
  });
});
