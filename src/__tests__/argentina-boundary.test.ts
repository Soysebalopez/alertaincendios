import { describe, expect, it } from "vitest";
import { isInArgentina } from "@/lib/argentina-polygon";

/**
 * The country trim decides which FIRMS detections the site calls "Argentina"
 * and which locations the bot accepts as subscribers.
 *
 * Measured on 2026-09-17 against the real border: the hand-drawn silhouette ran
 * straight from Salta to Misiones, so it swallowed the Paraguayan Chaco —
 * 856 of the 2,065 fires on the map that day (41%) were in Paraguay, in the
 * middle of its burning season.
 *
 * Border precision is about 3 km: the boundary data is a world-scale outline,
 * so coastal towns (Ushuaia sits 0.6 km outside its line) need the same margin
 * the forest zones use.
 */
describe("isInArgentina", () => {
  it.each([
    ["Clorinda, Formosa (a un paso del límite)", -25.283, -57.717],
    ["Puerto Iguazú, Misiones", -25.695, -54.437],
    ["La Quiaca, Jujuy", -22.105, -65.597],
    ["Resistencia, Chaco", -27.451, -58.986],
    ["Ushuaia (0,6 km fuera del trazo mundial)", -54.801, -68.303],
    ["Río Grande, Tierra del Fuego", -53.787, -67.71],
    ["El Calafate, Santa Cruz", -50.34, -72.27],
    ["Puerto Madryn, Chubut", -42.769, -65.038],
    ["Bahía Blanca", -38.7196, -62.2724],
  ])("acepta %s", (_lugar, lat, lng) => {
    expect(isInArgentina(lat, lng)).toBe(true);
  });

  it.each([
    ["el foco del Chaco paraguayo del 17/9", -23.06996, -57.2646],
    ["Asunción, Paraguay", -25.28, -57.63],
    ["Chaco paraguayo profundo", -22.0, -59.5],
    ["Punta Arenas, Chile", -53.16, -70.91],
    ["Colonia, Uruguay", -34.47, -57.84],
    ["Porto Alegre, Brasil", -30.033, -51.23],
    ["Atlántico, 100 km mar adentro", -38.0, -55.0],
  ])("rechaza %s", (_lugar, lat, lng) => {
    expect(isInArgentina(lat, lng)).toBe(false);
  });
});
