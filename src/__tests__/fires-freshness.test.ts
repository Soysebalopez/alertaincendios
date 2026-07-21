import { describe, it, expect } from "vitest";
import { decideFreshnessAction, decideMonitorActions } from "@/lib/fires-freshness";

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

describe("decideMonitorActions", () => {
  const base = { ageMinutes: 5, thresholdMinutes: 60, staleAlerted: false };

  it("alerts key-invalid when the error flag appears", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: false });
    expect(r.key).toBe("alert_key_invalid");
  });
  it("does not repeat the key alert while flagged (anti-spam)", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: true });
    expect(r.key).toBe("none");
  });
  it("signals key recovery when the flag clears after an alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: true });
    expect(r.key).toBe("alert_key_recovered");
  });
  it("stays silent with no flag and no outstanding alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: false });
    expect(r.key).toBe("none");
    expect(r.freshness).toBe("none");
  });
  it("suppresses the generic staleness alert while the key error is active", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: true,
      keyAlerted: true,
    });
    expect(r.freshness).toBe("none");
  });
  it("keeps normal staleness behavior when there is no key error", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: false,
      keyAlerted: false,
    });
    expect(r.freshness).toBe("alert_stale");
  });
  it("suppresses staleness while the key-invalid alert itself is firing", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: true,
      keyAlerted: false,
    });
    expect(r).toEqual({ key: "alert_key_invalid", freshness: "none" });
  });
  // Deliberate dual-message case the route documents: a key recovery and an
  // independently-stale (not-yet-alerted) cache can both be true in the same
  // run, and each gets its own accurate Telegram message rather than being
  // merged or suppressed.
  it("fires both key-recovered and stale-not-yet-alerted in the same run", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: false,
      keyAlerted: true,
    });
    expect(r).toEqual({ key: "alert_key_recovered", freshness: "alert_stale" });
  });
});
