import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FRONT_LEGEND,
  POSSIBLE_FIRE_LABEL,
  SMOKE_LEGEND,
  VARIABLE_LEGEND,
  frontEtaLabel,
  frontStyle,
  legendFooter,
  projectionIsCurrent,
  windSourceLabel,
} from "@/lib/projection-legend";

/**
 * WHI-907 part 11 — how the smoke and fire-front projection reads on the map.
 * Lessons from the hurricane "cone of uncertainty": every line carries its
 * time written out (not only a colour), the legend says it is an estimate and
 * that outside the shape is not safe, and expired shapes are hidden.
 */
// 14:05 in Argentina (UTC−3).
const ISSUED = "2026-09-14T17:05:00.000Z";

describe("frontEtaLabel", () => {
  it.each([
    [30, "+30 min (≈14:35)"],
    [60, "+1 h (≈15:05)"],
    [120, "+2 h (≈16:05)"],
    [180, "+3 h (≈17:05)"],
  ])("%i min → %s, in Argentina time", (eta, label) => {
    expect(frontEtaLabel(eta, ISSUED)).toBe(label);
  });
});

describe("frontStyle", () => {
  it("goes from dark and dense at +30 min to light and faint at +3 h", () => {
    expect(frontStyle(30)).toEqual({ color: "#7c2d12", fillOpacity: 0.45 });
    expect(frontStyle(180)).toEqual({ color: "#fdba74", fillOpacity: 0.12 });
    const opacities = [30, 60, 120, 180].map((eta) => frontStyle(eta).fillOpacity);
    expect([...opacities].sort((a, b) => b - a)).toEqual(opacities);
  });
});

describe("legend texts", () => {
  it("say what each layer is, and that it is an estimate", () => {
    expect(SMOKE_LEGEND).toBe("Hacia dónde va el humo (próximas 3 h)");
    expect(FRONT_LEGEND).toBe("Hasta dónde podría avanzar el fuego si el viento se mantiene");
    expect(VARIABLE_LEGEND).toBe("Viento variable");
    expect(POSSIBLE_FIRE_LABEL).toBe("Posible foco");
    expect(legendFooter(ISSUED)).toBe(
      "Es una estimación, no un límite. Fuera de la zona también puede llegar humo o fuego. " +
        "Seguí las indicaciones de Defensa Civil y bomberos. Actualizado 14:05."
    );
  });
});

describe("windSourceLabel", () => {
  it("names where the wind came from", () => {
    expect(windSourceLabel("smn-wrf")).toBe("SMN 4 km");
    expect(windSourceLabel("open-meteo")).toBe("Open-Meteo");
  });
});

describe("projectionIsCurrent", () => {
  it("hides shapes past their valid_to, and anything with a broken date", () => {
    expect(projectionIsCurrent("2026-09-14T18:05:00Z", new Date("2026-09-14T18:04:00Z"))).toBe(true);
    expect(projectionIsCurrent("2026-09-14T18:05:00Z", new Date("2026-09-14T18:06:00Z"))).toBe(false);
    expect(projectionIsCurrent("garbage", new Date("2026-09-14T18:04:00Z"))).toBe(false);
  });
});

describe("city map", () => {
  it("shows the legend: both layer texts and the estimate footer", () => {
    const source = readFileSync(path.join(__dirname, "..", "components", "city", "city-map.tsx"), "utf8");
    for (const name of ["SMOKE_LEGEND", "FRONT_LEGEND", "legendFooter(", "frontEtaLabel("]) {
      expect(source, `city-map.tsx must use ${name}`).toContain(name);
    }
  });
});
