import { describe, it, expect } from "vitest";
import { buildPreferencesKeyboard, parsePreferencesCallback } from "@/lib/preferences-keyboard";

describe("buildPreferencesKeyboard", () => {
  it("includes a lightning toggle row", () => {
    const kb = buildPreferencesKeyboard({ lightning: true, prevention: "off", covered: false });
    const flat = kb.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data === "prefs|lightning")).toBe(true);
  });
  it("omits prevention rows when the sub is not in a covered zone", () => {
    const kb = buildPreferencesKeyboard({ lightning: true, prevention: "off", covered: false });
    const flat = kb.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data.startsWith("prefs|prev:"))).toBe(false);
  });
  it("shows the three prevention options when covered", () => {
    const kb = buildPreferencesKeyboard({ lightning: false, prevention: "alerts", covered: true });
    const data = kb.inline_keyboard.flat().map((b) => b.callback_data);
    expect(data).toContain("prefs|prev:daily");
    expect(data).toContain("prefs|prev:alerts");
    expect(data).toContain("prefs|prev:off");
  });
});

describe("parsePreferencesCallback", () => {
  it("parses a lightning toggle", () => {
    expect(parsePreferencesCallback("prefs|lightning")).toEqual({ kind: "lightning" });
  });
  it("parses a prevention mode set", () => {
    expect(parsePreferencesCallback("prefs|prev:daily")).toEqual({ kind: "prevention", mode: "daily" });
  });
  it("returns null for non-prefs or malformed data", () => {
    expect(parsePreferencesCallback("fb|f:1|s")).toBeNull();
    expect(parsePreferencesCallback(undefined)).toBeNull();
    expect(parsePreferencesCallback("prefs|prev:bogus")).toBeNull();
  });
});
