/**
 * Capa "campo y pastizal" (Seba, 28/9): fuera de las zonas de bosque, toda
 * Argentina, sin industrias, a ≤ 20 km y sólo fuegos intensos, un aviso por
 * incendio. La capa de bosque no cambia.
 */
import { describe, it, expect } from "vitest";
import {
  esFocoDeCampo,
  selectCampoPairs,
  campoFireKey,
  posicionDeClave,
  yaAvisadoMismoIncendio,
  CAMPO_RADIUS_KM,
  CAMPO_MIN_FRP_MW,
} from "@/lib/campo-alerts";
import { isStaticHeatSource } from "@/lib/static-heat-sources";
import { FUENTES_FIJAS_ARCHIVO } from "@/lib/static-heat-sources-archivo";
import { PROVINCES } from "@/lib/argentina-cities";

// Un campo cerca de Bahía Blanca, lejos de sus dos sitios industriales.
const CAMPO = { latitude: -38.62, longitude: -62.1, frp: 25, acqDate: "2026-01-10" };
const VECINO = { chat_id: 1, lat: -38.7196, lng: -62.2724 };

describe("qué foco entra en la capa de campo", () => {
  it("🔴 un foco intenso fuera de bosque, lejos de industrias: sí", () => {
    expect(esFocoDeCampo(CAMPO)).toBe(true);
  });
  it("🔴 un foco en zona de bosque: NO — lo sigue avisando la capa de bosque, como siempre", () => {
    expect(esFocoDeCampo({ ...CAMPO, forestZone: "yungas" })).toBe(false);
  });
  it("🔴 desde el 1/10 (tres satélites) el piso es 15 MW: un fuego de 12 MW ya no avisa", () => {
    expect(CAMPO_MIN_FRP_MW).toBe(15);
    expect(esFocoDeCampo({ ...CAMPO, frp: 12 })).toBe(false);
    expect(esFocoDeCampo({ ...CAMPO, frp: 16 })).toBe(true);
  });
  it("🔴 un foco débil (FRP ≤ piso): no", () => {
    expect(esFocoDeCampo({ ...CAMPO, frp: CAMPO_MIN_FRP_MW })).toBe(false);
    expect(esFocoDeCampo({ ...CAMPO, frp: 3 })).toBe(false);
  });
  it("🔴 una industria (acería de San Nicolás, la fuente fija más activa del país): no", () => {
    const [lat, lng] = FUENTES_FIJAS_ARCHIVO[0];
    expect(esFocoDeCampo({ ...CAMPO, latitude: lat, longitude: lng, frp: 80 })).toBe(false);
  });
  it("el polo de Ingeniero White sigue fuera (lista de Bahía, WHI-907)", () => {
    expect(isStaticHeatSource(-38.7752, -62.289)).toBe(true);
  });
});

describe("las ciudades quedan incluidas", () => {
  it("🔴 ningún centro de las 79 ciudades cae dentro de una fuente fija", () => {
    const tapadas = PROVINCES.flatMap((p) => p.cities).filter((c) => isStaticHeatSource(c.lat, c.lng));
    expect(tapadas.map((c) => c.name)).toEqual([]);
  });
  it("la lista nacional existe y cubre todo el país (no sólo Bahía)", () => {
    expect(FUENTES_FIJAS_ARCHIVO.length).toBeGreaterThan(300);
    const lats = FUENTES_FIJAS_ARCHIVO.map(([lat]) => lat);
    expect(Math.min(...lats)).toBeLessThan(-45); // Patagonia sur
    expect(Math.max(...lats)).toBeGreaterThan(-28); // Norte
  });
});

describe("a quién se le avisa", () => {
  it("🔴 a ≤ 20 km sí; a más, no", () => {
    const cerca = selectCampoPairs([CAMPO], [VECINO]);
    expect(cerca).toHaveLength(1);
    expect(cerca[0].distKm).toBeLessThanOrEqual(CAMPO_RADIUS_KM);
    const lejos = { ...VECINO, lat: -39.2 }; // ~50 km al sur
    expect(selectCampoPairs([CAMPO], [lejos])).toEqual([]);
  });
  it("🔴 viene prendida para todos: sin valor cargado también avisa", () => {
    expect(selectCampoPairs([CAMPO], [{ ...VECINO, campo_enabled: null }])).toHaveLength(1);
    expect(selectCampoPairs([CAMPO], [{ ...VECINO, campo_enabled: undefined }])).toHaveLength(1);
  });
  it("🔴 quien la apagó con /campo no recibe nada", () => {
    expect(selectCampoPairs([CAMPO], [{ ...VECINO, campo_enabled: false }])).toEqual([]);
  });
});

describe("un aviso por incendio", () => {
  it("la clave lleva prefijo propio y se puede leer de vuelta", () => {
    const key = campoFireKey(CAMPO);
    expect(key.startsWith("c:")).toBe(true);
    expect(posicionDeClave(key)).toEqual({ lat: -38.62, lng: -62.1 });
    expect(posicionDeClave("-38.620_-62.100_2026-01-10")).toBeNull(); // una clave de bosque
  });
  it("🔴 otra detección a ≤ 2 km del mismo incendio no se vuelve a avisar", () => {
    const recientes = [campoFireKey(CAMPO)];
    expect(yaAvisadoMismoIncendio({ ...CAMPO, latitude: -38.63 }, recientes)).toBe(true); // ~1,1 km
  });
  it("un foco a más de 2 km es otro incendio: se avisa", () => {
    const recientes = [campoFireKey(CAMPO)];
    expect(yaAvisadoMismoIncendio({ ...CAMPO, latitude: -38.68 }, recientes)).toBe(false); // ~6,7 km
  });
  it("las claves de bosque no cuentan como avisos de campo", () => {
    expect(yaAvisadoMismoIncendio(CAMPO, ["-38.620_-62.100_2026-01-10"])).toBe(false);
  });
});
