import { describe, it, expect } from "vitest";
import { formatPreventionAlert, formatDailyBriefing } from "@/lib/prevention-messages";
import type { ForecastDay } from "@/lib/prevention-trigger";

const fc = (...c: string[]): ForecastDay[] =>
  c.map((x, i) => ({ target_date: `2026-06-${String(24 + i).padStart(2, "0")}`, danger_class: x as ForecastDay["danger_class"] }));

describe("formatPreventionAlert", () => {
  it("includes zone, level, date and citizen copy on initial alert", () => {
    const msg = formatPreventionAlert("Estepa Fueguina Norte", "extremo", "2026-06-25", null);
    expect(msg).toContain("Estepa Fueguina Norte");
    expect(msg).toContain("EXTREMO");
    expect(msg).toContain("jueves 25/06"); // 2026-06-25 is a Thursday (jueves)
    expect(msg).toContain("Prohibido todo fuego al aire libre"); // DANGER_COPY.extremo.action
    expect(msg).toContain("/preferencias");
  });
  it("phrases an escalation with the previous level", () => {
    const msg = formatPreventionAlert("Bosque Fueguino Sur", "extremo", "2026-06-24", "alto");
    expect(msg).toContain("SUBE");
    expect(msg).toContain("alto");
    expect(msg).toContain("EXTREMO");
  });
});

describe("formatDailyBriefing", () => {
  it("shows today's level and an outlook when it rises", () => {
    const msg = formatDailyBriefing("Bosque Fueguino Sur", "2026-06-24", fc("moderado", "alto"));
    expect(msg).toContain("Bosque Fueguino Sur");
    expect(msg).toContain("MODERADO");
    expect(msg).toContain("alto"); // outlook mentions the rise
    expect(msg).toContain("/preferencias");
  });
  it("uses a short form on a calm day", () => {
    const msg = formatDailyBriefing("Estepa Fueguina Norte", "2026-06-24", fc("bajo", "bajo"));
    expect(msg).toContain("sin novedades");
  });
});
