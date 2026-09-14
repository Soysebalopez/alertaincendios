import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  closestLightningUrl,
  parseLightningResponse,
  withinMonthlyBudget,
  xweatherConfigured,
} from "@/lib/xweather";

/**
 * WHI-907 part 3 — optional Xweather (Vaisala) confirmation of a GLM flash:
 * cloud-to-ground or not, located within ~1 km. Free "Developer" plan: 15,000
 * accesses/month. Inert without credentials. The fixture is the example
 * response copied from the endpoint documentation (checked 2026-09-14).
 */
const fixture = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "xweather-lightning-closest.json"), "utf8")
);

describe("xweatherConfigured", () => {
  it("needs both credentials", () => {
    expect(xweatherConfigured({})).toBe(false);
    expect(xweatherConfigured({ XWEATHER_CLIENT_ID: "id" })).toBe(false);
    expect(xweatherConfigured({ XWEATHER_CLIENT_ID: " id ", XWEATHER_CLIENT_SECRET: " secret\n" })).toBe(true);
  });

  it("blank values count as missing", () => {
    expect(xweatherConfigured({ XWEATHER_CLIENT_ID: "  ", XWEATHER_CLIENT_SECRET: "secret" })).toBe(false);
  });
});

describe("closestLightningUrl", () => {
  it("asks for cloud-to-ground strikes near a point, with trimmed credentials", () => {
    const url = new URL(
      closestLightningUrl(-38.72, -62.27, 30, { XWEATHER_CLIENT_ID: " id ", XWEATHER_CLIENT_SECRET: "secret\n" })
    );
    expect(url.origin + url.pathname).toBe("https://data.api.xweather.com/lightning/closest");
    expect(url.searchParams.get("p")).toBe("-38.72,-62.27");
    expect(url.searchParams.get("radius")).toBe("30km");
    expect(url.searchParams.get("filter")).toBe("cg");
    expect(url.searchParams.get("client_id")).toBe("id");
    expect(url.searchParams.get("client_secret")).toBe("secret");
  });
});

describe("parseLightningResponse", () => {
  it("reads the documented response shape", () => {
    expect(parseLightningResponse(fixture)).toEqual([
      {
        at: "2025-05-27T15:32:14+00:00",
        lat: 32.9001,
        lng: -87.3311,
        type: "cg",
        peakAmp: -7000,
        distanceKm: 9.119,
      },
    ]);
  });

  it("an error response yields no strikes", () => {
    expect(
      parseLightningResponse({ success: false, error: { code: "invalid_client", description: "x" }, response: [] })
    ).toEqual([]);
  });

  it("anything malformed yields no strikes", () => {
    expect(parseLightningResponse(null)).toEqual([]);
    expect(parseLightningResponse({ success: true, response: [{}] })).toEqual([]);
  });
});

describe("withinMonthlyBudget", () => {
  it("keeps 10% of the free plan in reserve, counting 10 accesses per lightning query until verified", () => {
    // floor(15000 × 0.9 / 10) = 1350 queries per month.
    expect(withinMonthlyBudget(1349, {})).toBe(true);
    expect(withinMonthlyBudget(1350, {})).toBe(false);
  });

  it("uses the verified numbers once they are configured", () => {
    const env = { XWEATHER_MONTHLY_ACCESSES: "15000", XWEATHER_ACCESSES_PER_LIGHTNING_QUERY: " 1 " };
    expect(withinMonthlyBudget(13499, env)).toBe(true);
    expect(withinMonthlyBudget(13500, env)).toBe(false);
  });
});
