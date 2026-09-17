import { describe, expect, it } from "vitest";
import { countFireEvents, countForestFireEvents } from "@/lib/fire-events";

/**
 * El satélite ve un mismo incendio como varios píxeles vecinos: el 17/9, las
 * 426 detecciones forestales del día eran 217 incendios distintos. El número
 * grande de la home dice "incendios", así que tiene que contar incendios.
 */
const fuego = (lat: number, lng: number, extra: Record<string, unknown> = {}) => ({
  latitude: lat,
  longitude: lng,
  type: 0,
  forestZone: "chaco-norte",
  ...extra,
});

describe("countFireEvents", () => {
  it("dos detecciones del mismo fuego (menos de 1 km) cuentan una vez", () => {
    expect(countFireEvents([fuego(-26.5, -60.0), fuego(-26.508, -60.0)])).toBe(1);
  });

  it("dos fuegos separados por 10 km cuentan dos", () => {
    expect(countFireEvents([fuego(-26.5, -60.0), fuego(-26.59, -60.0)])).toBe(2);
  });

  it("los une en cadena: A–B a 1,5 km y B–C a 1,5 km son un solo incendio", () => {
    expect(
      countFireEvents([fuego(-26.5, -60.0), fuego(-26.5135, -60.0), fuego(-26.527, -60.0)]),
    ).toBe(1);
  });

  it("sin detecciones, cero", () => {
    expect(countFireEvents([])).toBe(0);
  });
});

describe("countForestFireEvents", () => {
  it("cuenta sólo vegetación dentro de zona forestal", () => {
    const fires = [
      fuego(-26.5, -60.0),
      fuego(-30.0, -60.0, { forestZone: undefined }), // pastizal, fuera de zona
      fuego(-38.775, -62.289, { type: 2, forestZone: "chaco-norte" }), // antorcha industrial
    ];
    expect(countForestFireEvents(fires)).toBe(1);
  });

  it("agrupa las detecciones del mismo incendio forestal", () => {
    const fires = [
      fuego(-26.5, -60.0),
      fuego(-26.505, -60.002),
      fuego(-26.51, -60.0),
      fuego(-27.9, -55.5, { forestZone: "selva-misionera" }),
    ];
    expect(countForestFireEvents(fires)).toBe(2);
  });
});
