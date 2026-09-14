import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMetarRecord } from "@/lib/metar";

/**
 * WHI-907 part 4 — observed wind at Bahía Blanca airport (SAZB) from the
 * aviationweather.gov METAR JSON API. The fixture is a real response captured
 * on 2026-09-14. METAR wind direction is where the wind blows FROM; speeds are
 * knots. When there are no gusts the API omits `wgst` entirely.
 */
const records = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures", "metar-sazb.json"), "utf8")
) as Array<Record<string, unknown>>;

const KT_TO_KMH = 1.852;

describe("parseMetarRecord", () => {
  it("parses a real SAZB record: knots → km/h, direction FROM", () => {
    const rec = records[0];
    const obs = parseMetarRecord(rec);
    expect(obs?.station).toBe("SAZB");
    expect(obs?.observedAt).toBe(rec.reportTime);
    expect(obs?.windFromDeg).toBe(rec.wdir);
    expect(obs?.windKmh).toBeCloseTo((rec.wspd as number) * KT_TO_KMH, 6);
    expect(obs?.gustKmh).toBe(typeof rec.wgst === "number" ? rec.wgst * KT_TO_KMH : null);
    expect(obs?.variable).toBe(false);
  });

  it("variable wind (VRB) has no direction", () => {
    const obs = parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: "VRB", wspd: 3 });
    expect(obs).toMatchObject({ windFromDeg: null, variable: true });
  });

  it("converts gusts when present", () => {
    const obs = parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: 330, wspd: 20, wgst: 30 });
    expect(obs?.gustKmh).toBeCloseTo(55.56, 2);
  });

  it("rejects records without time or speed", () => {
    expect(parseMetarRecord({ icaoId: "SAZB", wdir: 330, wspd: 20 })).toBeNull();
    expect(parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: 330 })).toBeNull();
  });

  it("rejects anything that is not a record", () => {
    expect(parseMetarRecord(null)).toBeNull();
    expect(parseMetarRecord("METAR SAZB 141400Z 32020KT")).toBeNull();
  });
});
