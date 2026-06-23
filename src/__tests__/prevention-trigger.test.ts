import { describe, it, expect } from "vitest";
import { evaluatePreventionTrigger, type ForecastDay } from "@/lib/prevention-trigger";

const days = (...classes: string[]): ForecastDay[] =>
  classes.map((c, i) => ({
    target_date: `2026-06-${String(24 + i).padStart(2, "0")}`,
    danger_class: c as ForecastDay["danger_class"],
  }));
const TODAY = "2026-06-24";

describe("evaluatePreventionTrigger", () => {
  it("no alert when window stays below alto and no prior episode", () => {
    expect(evaluatePreventionTrigger(days("bajo", "moderado", "bajo"), TODAY, null))
      .toEqual({ action: "none" });
  });
  it("alerts on initial crossing to alto", () => {
    expect(evaluatePreventionTrigger(days("moderado", "alto", "bajo"), TODAY, null))
      .toEqual({ action: "alert", peak: "alto", peakDate: "2026-06-25" });
  });
  it("escalates when peak rises above the alerted class", () => {
    expect(evaluatePreventionTrigger(days("extremo", "alto"), TODAY, "alto"))
      .toEqual({ action: "escalate", peak: "extremo", peakDate: "2026-06-24", from: "alto" });
  });
  it("no re-alert when already alerted at the same peak", () => {
    expect(evaluatePreventionTrigger(days("alto", "moderado"), TODAY, "alto"))
      .toEqual({ action: "none" });
  });
  it("clears the episode when window drops below alto", () => {
    expect(evaluatePreventionTrigger(days("moderado", "bajo"), TODAY, "alto"))
      .toEqual({ action: "clear" });
  });
  it("only looks at the next 3 days", () => {
    // day 4 is extremo but outside the window → no alert
    expect(evaluatePreventionTrigger(days("bajo", "bajo", "bajo", "extremo"), TODAY, null))
      .toEqual({ action: "none" });
  });
});
