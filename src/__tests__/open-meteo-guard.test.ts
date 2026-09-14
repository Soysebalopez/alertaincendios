import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WHI-907 part 1 — every Open-Meteo call must go through the single switch
 * (src/lib/open-meteo.ts in TypeScript, fire_danger/openmeteo.py in Python),
 * otherwise turning on the paid plan silently leaves some calls on the free
 * host, which forbids commercial use.
 */
const REPO = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src", "fire_danger", "api"];
const ALLOWED = new Set([
  "src/lib/open-meteo.ts",
  "fire_danger/openmeteo.py",
  "src/__tests__/open-meteo-url.test.ts",
  "src/__tests__/open-meteo-guard.test.ts",
]);
const API_HOST = /[a-z-]*api\.open-meteo\.com/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__pycache__" ? [] : files(full);
    return /\.(ts|tsx|py)$/.test(entry.name) ? [full] : [];
  });
}

describe("Open-Meteo single switch", () => {
  it("no file outside the builder hardcodes an Open-Meteo API host", () => {
    const offenders = SCAN_DIRS.flatMap((dir) => files(path.join(REPO, dir)))
      .map((file) => path.relative(REPO, file))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => API_HOST.test(readFileSync(path.join(REPO, rel), "utf8")))
      .sort();
    expect(offenders).toEqual([]);
  });
});
