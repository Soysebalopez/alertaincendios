import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WHI-907 — the homepage and footer list where the data comes from, and a
 * "coming soon" roadmap. After this update both went stale: the SMN wind and
 * Vaisala Xweather lightning were missing (the SMN licence asks to be credited),
 * Telegram is not a data source, Sentinel-5P repeated Copernicus, and the
 * roadmap still promised three things that now exist.
 */
const root = path.join(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from, `missing ${start}`).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to, `missing end of ${start}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("homepage data sources", () => {
  const home = read("app/(main)/page.tsx");
  const sources = between(home, "const DATA_SOURCES = [", "] as const;");

  it("credits the SMN and Vaisala Xweather", () => {
    expect(sources).toContain('name: "SMN"');
    expect(sources).toContain('name: "Vaisala Xweather"');
  });

  it("drops what is not a separate data source", () => {
    expect(sources).not.toContain('icon: "telegram"');
    expect(sources).not.toContain('name: "Sentinel-5P"');
  });

  it("the roadmap no longer promises what already exists", () => {
    const upcoming = between(home, "const UPCOMING = [", "] as const;");
    for (const delivered of ["tormenta seca", "hacia dónde se mueve el humo", "Más fuentes de datos"]) {
      expect(upcoming, `"${delivered}" is already built`).not.toContain(delivered);
    }
  });
});

describe("footer data sources", () => {
  it("lists the same new sources", () => {
    const datos = between(read("components/footer.tsx"), 'title: "Datos"', "],");
    expect(datos).toContain('label: "SMN"');
    expect(datos).toContain('label: "Vaisala Xweather"');
  });
});
