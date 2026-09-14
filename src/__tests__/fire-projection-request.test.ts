import { describe, expect, it } from "vitest";
import { fireProjectionPath } from "@/lib/fire-projection-request";

function parse(path: string) {
  const url = new URL(path, "https://alertaforestal.org");
  return { pathname: url.pathname, params: url.searchParams };
}

describe("fireProjectionPath (city map → /api/fire-projection)", () => {
  it("asks for the grassland front for a confirmed fire outside every forest zone", () => {
    const { pathname, params } = parse(
      fireProjectionPath({ lat: -38.61234, lng: -62.40009, confirmed: true }),
    );
    expect(pathname).toBe("/api/fire-projection");
    expect(params.get("lat")).toBe("-38.6123");
    expect(params.get("lng")).toBe("-62.4001");
    expect(params.get("confirmed")).toBe("1");
    expect(params.get("grass")).toBe("1");
  });

  it("never asks for the grassland front for a fire inside a forest zone", () => {
    const { params } = parse(
      fireProjectionPath({ lat: -54.8, lng: -68.3, confirmed: true, forestZone: "any-forest-zone" }),
    );
    expect(params.get("confirmed")).toBe("1");
    expect(params.has("grass")).toBe(false);
  });

  it("a focus that nothing confirms anymore asks for smoke only", () => {
    const { params } = parse(fireProjectionPath({ lat: -38.6, lng: -62.4, confirmed: false }));
    expect(params.has("confirmed")).toBe(false);
    expect(params.has("grass")).toBe(false);
  });
});
