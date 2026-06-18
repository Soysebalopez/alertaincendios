import { describe, expect, it } from "vitest";
import {
  DANGER_CLASSES,
  PREVENTION_PROVINCE_IDS,
  dangerColor,
  dangerPillTone,
  worstClass,
  provinceBbox,
  forecastDateLabel,
  type DangerZone,
} from "../lib/fire-danger";

describe("fire-danger pure helpers", () => {
  it("orders classes and maps colors + pill tones", () => {
    expect(DANGER_CLASSES).toEqual(["bajo", "moderado", "alto", "muy alto", "extremo"]);
    expect(dangerColor("bajo")).toBe("#4d8f54");
    expect(dangerColor("alto")).toBe("#d2541d");
    expect(dangerColor("extremo")).toBe("#c23a3a");
    expect(dangerPillTone("bajo")).toBe("good");
    expect(dangerPillTone("moderado")).toBe("warn");
    expect(dangerPillTone("alto")).toBe("bad");
    expect(dangerPillTone("muy alto")).toBe("danger");
    expect(dangerPillTone("extremo")).toBe("danger");
  });

  it("worstClass returns the highest severity present", () => {
    expect(worstClass(["bajo", "alto", "moderado"])).toBe("alto");
    expect(worstClass(["bajo", "bajo"])).toBe("bajo");
    expect(worstClass([])).toBe("bajo");
  });

  it("provinceBbox unions zone bboxes [south,north,west,east]", () => {
    const zones = [
      { bbox: [-54.2, -52.6, -68.6, -66.4] },
      { bbox: [-55.1, -54.2, -68.7, -66.9] },
    ] as DangerZone[];
    expect(provinceBbox(zones)).toEqual([-55.1, -52.6, -68.7, -66.4]);
  });

  it("forecastDateLabel labels today/tomorrow/relative", () => {
    expect(forecastDateLabel("2026-06-18", "2026-06-18")).toBe("Hoy");
    expect(forecastDateLabel("2026-06-19", "2026-06-18")).toBe("Mañana");
    expect(forecastDateLabel("2026-06-21", "2026-06-18")).toBe("+3 días");
  });

  it("exposes Tierra del Fuego as a prevention province", () => {
    expect(PREVENTION_PROVINCE_IDS).toContain("tierra-del-fuego");
  });
});
