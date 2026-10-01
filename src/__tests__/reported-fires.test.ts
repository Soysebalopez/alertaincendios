/**
 * Qué focos informa la web (2026-10-01): todo incendio —bosque y campo—, sin
 * las fuentes fijas de calor (antorchas, acerías, refinerías, volcanes).
 *
 * Reemplaza a forest-filter-consistency.test.ts, que comparaba tres RÉPLICAS
 * escritas a mano del filtro de cada pantalla: si alguien cambiaba una pantalla
 * y no su réplica, el test seguía verde. Ahora las tres pantallas llaman a la
 * misma función, y este test mira su código para que lo sigan haciendo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  fireKind,
  isReportedFire,
  countReportedFireEvents,
  frpBucket,
} from "@/lib/reported-fires";
import { FUENTES_FIJAS_ARCHIVO } from "@/lib/static-heat-sources-archivo";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Un campo cerca de Bahía Blanca, lejos de sus sitios industriales (mismo punto
// que usan los tests de la capa de campo).
const CAMPO = { latitude: -38.62, longitude: -62.1, frp: 25, type: 0 };
const BOSQUE = { latitude: -24.5, longitude: -65.0, frp: 8, type: 0, forestZone: "yungas" };
const [aLat, aLng] = FUENTES_FIJAS_ARCHIVO[0]; // acería de San Nicolás
const ACERIA = { latitude: aLat, longitude: aLng, frp: 80, type: 0 };

describe("qué es un incendio para la web", () => {
  it("🔴 un fuego de campo, fuera de toda zona de bosque, SE INFORMA", () => {
    expect(fireKind(CAMPO)).toBe("campo");
    expect(isReportedFire(CAMPO)).toBe(true);
  });
  it("un fuego en zona de bosque se informa como bosque", () => {
    expect(fireKind(BOSQUE)).toBe("bosque");
  });
  it("🔴 una fuente fija conocida NO, aunque el feed la traiga como vegetación (sin type)", () => {
    expect(fireKind(ACERIA)).toBe("excluido");
    expect(fireKind({ ...ACERIA, type: undefined })).toBe("excluido");
  });
  it("🔴 lo que VIIRS o la reclasificación por cuenca marcan industrial, volcán u offshore: NO", () => {
    for (const type of [1, 2, 3]) expect(isReportedFire({ ...CAMPO, type })).toBe(false);
  });
  it("una antorcha dentro de una zona de bosque tampoco cuenta como bosque", () => {
    expect(fireKind({ ...BOSQUE, type: 2 })).toBe("excluido");
  });
});

describe("conteos", () => {
  it("cortes de potencia", () => {
    expect([frpBucket(20), frpBucket(5), frpBucket(4.9)]).toEqual(["high", "moderate", "low"]);
  });

  it("🔴 cuenta incendios, no detecciones, y las partes suman el total", () => {
    const mismoCampo = { ...CAMPO, latitude: CAMPO.latitude + 0.003 }; // ~330 m
    const r = countReportedFireEvents([CAMPO, mismoCampo, BOSQUE, ACERIA]);
    expect(r).toEqual({ total: 2, bosque: 1, campo: 1, byIntensity: { high: 1, moderate: 1, low: 0 } });
    expect(r.bosque + r.campo).toBe(r.total);
  });

  it("🔴 alta + moderada + baja = total: la potencia de un incendio es la de su detección más fuerte", () => {
    const debil = { ...CAMPO, frp: 1, latitude: CAMPO.latitude + 0.003 };
    const r = countReportedFireEvents([CAMPO, debil]); // mismo incendio: 25 MW y 1 MW
    expect(r.byIntensity).toEqual({ high: 1, moderate: 0, low: 0 });
    const { high, moderate, low } = r.byIntensity;
    expect(high + moderate + low).toBe(r.total);
  });

  it("un incendio que toca una zona de bosque es de bosque, aunque parte esté afuera", () => {
    const borde = { ...BOSQUE, forestZone: undefined, latitude: BOSQUE.latitude + 0.003 };
    expect(countReportedFireEvents([BOSQUE, borde])).toMatchObject({ total: 1, bosque: 1, campo: 0 });
  });
});

describe("las tres pantallas usan la MISMA regla", () => {
  it("🔴 home (servidor y refresco en vivo)", () => {
    expect(leer("src/app/(main)/page.tsx")).toContain("countReportedFireEvents(fires)");
    expect(leer("src/components/hero-auto-refresh.tsx")).toContain("countReportedFireEvents(fires)");
  });
  it("🔴 mini mapa de la home y /mapa: mismos conteos y mismo filtro de dibujo", () => {
    for (const rel of ["src/components/fire-map.tsx", "src/components/map/argentina-map.tsx"]) {
      const src = leer(rel);
      // Los números de los botones: incendios, con la función de la home.
      expect(src, rel).toContain("countReportedFireEvents(fires)");
      expect(src, rel).toMatch(/fireKind\(f\);\s*if \(kind === "excluido"\) continue;/);
      // Ninguna copia propia del corte de potencia.
      expect(src, rel).not.toMatch(/function frpBucket/);
    }
  });
  it("🔴 páginas de ciudad: muestran todo incendio por default, con la misma regla", () => {
    for (const rel of [
      "src/components/city/city-map.tsx",
      "src/components/city/city-forest-fires.tsx",
      "src/components/city/city-dashboard.tsx",
    ]) {
      expect(leer(rel), rel).toContain('fireFilter = "vegetation"');
    }
    expect(leer("src/lib/city-fires.ts")).toContain("return isReportedFire(");
  });
});
