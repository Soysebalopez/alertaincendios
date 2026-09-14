import { describe, expect, it } from "vitest";
import { BAHIA_BLANCA, bahiaMapLink, parseFocus } from "@/lib/bahia-blanca";
import { findCityBySlug } from "@/lib/city-slug";

/**
 * WHI-907 part 9 — the Bahía Blanca page accepts ?foco=<lat>,<lng> to center
 * its map on a fire, and fire alerts near Bahía link there ("Ver hacia dónde
 * va"). Both only make sense around Bahía Blanca: a crafted link must not
 * center this page on a fire in another province.
 */
describe("BAHIA_BLANCA", () => {
  it("uses the same coordinates as the city list the bot subscribes with", () => {
    const listed = findCityBySlug("bahia-blanca");
    expect(BAHIA_BLANCA).toMatchObject({ lat: listed?.city.lat, lng: listed?.city.lng });
  });
});

describe("parseFocus", () => {
  it("reads lat,lng, tolerating spaces", () => {
    expect(parseFocus("-38.61,-62.40")).toEqual({ lat: -38.61, lng: -62.4 });
    expect(parseFocus(" -38.61 , -62.40 ")).toEqual({ lat: -38.61, lng: -62.4 });
  });

  it("a repeated parameter uses the first value", () => {
    expect(parseFocus(["-38.61,-62.40", "junk"])).toEqual({ lat: -38.61, lng: -62.4 });
  });

  it("anything malformed is ignored", () => {
    for (const raw of [undefined, "", "abc", "-38.6", "-38.6,-62.4,1", "-95,-62.4", "-38.6,abc"]) {
      expect(parseFocus(raw)).toBeNull();
    }
  });

  it("a fire more than 100 km from Bahía Blanca is ignored", () => {
    expect(parseFocus("-34.60,-58.38")).toBeNull();
  });
});

describe("bahiaMapLink", () => {
  it("links fires near Bahía Blanca to its page, centered on the fire", () => {
    expect(bahiaMapLink(-38.61, -62.4)).toBe("https://alertaforestal.org/bahia-blanca?foco=-38.6100,-62.4000");
  });

  it("no link for fires far from Bahía Blanca", () => {
    expect(bahiaMapLink(-41.13, -71.3)).toBeNull();
  });

  it("the link round-trips through parseFocus", () => {
    const link = bahiaMapLink(-38.61, -62.4, "https://preview.example");
    expect(link?.startsWith("https://preview.example/bahia-blanca?foco=")).toBe(true);
    expect(parseFocus(new URL(link as string).searchParams.get("foco") ?? undefined)).toEqual({ lat: -38.61, lng: -62.4 });
  });
});
