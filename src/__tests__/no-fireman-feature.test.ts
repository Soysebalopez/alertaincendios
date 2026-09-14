import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WHI-907 part 10 — the fireman/cuartel feature was retired on 2026-09-14
 * (1 code ever created, 0 uses). Advice to residents to call the firefighters
 * ("bomberos") is NOT part of that feature and stays allowed, which is why the
 * pattern does not include "bombero" on its own.
 */
const SRC = path.resolve(__dirname, "..");
const FORBIDDEN = /soybombero|dejarcuartel|fireman|cuartel/i;
const SELF = path.join("__tests__", "no-fireman-feature.test.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("retired fireman feature", () => {
  it("no source file references it", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => path.relative(SRC, file) !== SELF)
      .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file))
      .sort();
    expect(offenders).toEqual([]);
  });
});
