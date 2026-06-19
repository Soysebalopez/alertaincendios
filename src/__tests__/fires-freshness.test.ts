import { describe, it, expect } from "vitest";
import { decideFreshnessAction } from "@/lib/fires-freshness";

describe("decideFreshnessAction", () => {
  it("alerts when stale and not yet alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: false })).toBe("alert_stale");
  });
  it("stays silent when stale and already alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: true })).toBe("none");
  });
  it("signals recovery when fresh again after an alert", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: true })).toBe("alert_recovered");
  });
  it("stays silent when fresh and never alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
  it("treats exactly-at-threshold as fresh (strict greater-than)", () => {
    expect(decideFreshnessAction({ ageMinutes: 60, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
});
