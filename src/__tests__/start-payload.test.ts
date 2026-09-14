import { describe, expect, it } from "vitest";
import { PROVINCES } from "@/lib/argentina-cities";
import { citySlug, findCityBySlug } from "@/lib/city-slug";
import { parseStartPayload } from "@/lib/start-payload";

/**
 * WHI-907 part 9 — the Bahía Blanca page links to
 * t.me/alertaforestal_bot?start=ciudad-bahia-blanca. Telegram hands the bot
 * "/start ciudad-bahia-blanca"; the bot subscribes the person to that city
 * (same as /ciudad) and records where the subscription came from.
 */
describe("citySlug / findCityBySlug", () => {
  it("drops accents, case and spaces", () => {
    expect(citySlug("San Fernando del Valle")).toBe("san-fernando-del-valle");
    expect(citySlug("Bahía Blanca")).toBe("bahia-blanca");
  });

  it("finds Bahía Blanca with its province", () => {
    expect(findCityBySlug("bahia-blanca")).toMatchObject({
      city: { name: "Bahia Blanca", lat: -38.7196, lng: -62.2724 },
      province: { id: "buenos-aires" },
    });
  });

  it("a slug shared by two cities finds nothing, so a link never picks the wrong one", () => {
    // Rawson exists in Chubut and in San Juan.
    const rawsons = PROVINCES.flatMap((p) => p.cities.filter((c) => citySlug(c.name) === "rawson"));
    expect(rawsons).toHaveLength(2);
    expect(findCityBySlug("rawson")).toBeNull();
  });

  it("an unknown slug finds nothing", () => {
    expect(findCityBySlug("atlantis")).toBeNull();
  });
});

describe("parseStartPayload", () => {
  it("src-<slug> is a campaign, as before", () => {
    expect(parseStartPayload("src-radio-lu2")).toEqual({ kind: "campaign", source: "campaign:radio-lu2" });
  });

  it("ciudad-<slug> subscribes to that city and records the origin", () => {
    expect(parseStartPayload("ciudad-bahia-blanca")).toMatchObject({
      kind: "city",
      source: "campaign:ciudad-bahia-blanca",
      city: { name: "Bahia Blanca", lat: -38.7196, lng: -62.2724 },
      provinceName: "Buenos Aires",
    });
  });

  it("case and surrounding spaces do not matter", () => {
    expect(parseStartPayload("  CIUDAD-Bahia-Blanca ")?.kind).toBe("city");
  });

  it("a city we do not list, or an ambiguous one, is not a city payload", () => {
    expect(parseStartPayload("ciudad-atlantis")).toBeNull();
    expect(parseStartPayload("ciudad-rawson")).toBeNull();
  });

  it("anything else is an organic start", () => {
    expect(parseStartPayload("")).toBeNull();
    expect(parseStartPayload("hola")).toBeNull();
    expect(parseStartPayload("src-")).toBeNull();
  });
});
