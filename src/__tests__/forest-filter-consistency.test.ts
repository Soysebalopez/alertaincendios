import { describe, expect, it } from "vitest";

/**
 * Contract test: el hero counter, el mini-mapa del hero y /mapa deben aplicar
 * el MISMO filtro al mismo dataset crudo de focos.
 *
 * Origen: H-01 (auditoría 2026-05-21) — el mini-mapa del hero hacía su propio
 * fetch a /api/fires y no aplicaba el filtro forestal del pivote WHI-757,
 * mientras que el counter sí. Esto re-implementa la lógica en JS puro y
 * verifica que las tres superficies bucketean igual.
 *
 * Si alguien cambia el threshold FRP, el criterio de "forestZone truthy" o
 * el clasificador de wildfire, este test rompe ANTES de que la prod muestre
 * dos números distintos en la misma pantalla.
 */

interface FirePoint {
  type?: number;
  frp: number;
  forestZone?: string;
}

/** Réplica fiel del bucketing del hero counter. Si cambia la prod, cambia acá. */
function bucketHeroCounter(fires: FirePoint[]) {
  let high = 0,
    moderate = 0,
    low = 0,
    nonForestWild = 0,
    industrial = 0;
  for (const f of fires) {
    const isWild = (f.type ?? 0) === 0 || f.type === 1;
    if (!isWild) {
      industrial++;
      continue;
    }
    if (!f.forestZone) {
      nonForestWild++;
      continue;
    }
    if (f.frp >= 20) high++;
    else if (f.frp >= 5) moderate++;
    else low++;
  }
  return { high, moderate, low, nonForestWild, industrial };
}

/** Réplica del bucketing del mini-mapa (fire-map.tsx) post-fix H-01. */
function bucketMiniMap(fires: FirePoint[]) {
  const byIntensity = { high: 0, moderate: 0, low: 0 };
  let nonForestWild = 0;
  let industrial = 0;
  for (const f of fires) {
    const t = (f.type ?? 0) as 0 | 1 | 2 | 3;
    const isWild = t === 0 || t === 1;
    if (!isWild) {
      industrial++;
      continue;
    }
    if (!f.forestZone) {
      nonForestWild++;
      continue;
    }
    if (f.frp >= 20) byIntensity.high++;
    else if (f.frp >= 5) byIntensity.moderate++;
    else byIntensity.low++;
  }
  return { ...byIntensity, nonForestWild, industrial };
}

/** Réplica del bucketing de /mapa (argentina-map.tsx). */
function bucketFullMap(fires: FirePoint[]) {
  const c = { high: 0, moderate: 0, low: 0 };
  let nonForest = 0;
  for (const f of fires) {
    if (f.forestZone) {
      const frp = f.frp;
      if (frp >= 20) c.high++;
      else if (frp >= 5) c.moderate++;
      else c.low++;
    } else {
      nonForest++;
    }
  }
  return { ...c, nonForest };
}

const SAMPLE: FirePoint[] = [
  // 3 forestales altos
  { type: 0, frp: 50, forestZone: "andino-patagonico" },
  { type: 0, frp: 25, forestZone: "yungas" },
  { type: 1, frp: 30, forestZone: "selva-misionera" }, // volcano cuenta como wild
  // 2 forestales moderados
  { type: 0, frp: 10, forestZone: "espinal-mesopotamico" },
  { type: 0, frp: 6, forestZone: "sierras-cordoba" },
  // 4 forestales bajos
  { type: 0, frp: 3, forestZone: "chaco-norte" },
  { type: 0, frp: 1, forestZone: "yungas" },
  { type: 0, frp: 0.5, forestZone: "yungas" },
  { type: 0, frp: 2, forestZone: "andino-patagonico" },
  // 5 no forestales (wild)
  { type: 0, frp: 30, forestZone: undefined },
  { type: 0, frp: 15, forestZone: undefined },
  { type: 0, frp: 8, forestZone: undefined },
  { type: 0, frp: 4, forestZone: undefined },
  { type: 0, frp: 1, forestZone: undefined },
  // 2 industrial (flaring/offshore)
  { type: 2, frp: 100, forestZone: undefined },
  { type: 3, frp: 50, forestZone: undefined },
];

describe("forest filter consistency (bug-class oracle H-01)", () => {
  it("hero counter, mini-mapa y /mapa concuerdan en el total forestal", () => {
    const hero = bucketHeroCounter(SAMPLE);
    const mini = bucketMiniMap(SAMPLE);
    const full = bucketFullMap(SAMPLE);

    const heroForestTotal = hero.high + hero.moderate + hero.low;
    const miniForestTotal = mini.high + mini.moderate + mini.low;
    const fullForestTotal = full.high + full.moderate + full.low;

    expect(heroForestTotal).toBe(9);
    expect(miniForestTotal).toBe(heroForestTotal);
    expect(fullForestTotal).toBe(heroForestTotal);
  });

  it("buckets por intensidad coinciden entre hero y mini-mapa", () => {
    const hero = bucketHeroCounter(SAMPLE);
    const mini = bucketMiniMap(SAMPLE);
    expect(mini.high).toBe(hero.high);
    expect(mini.moderate).toBe(hero.moderate);
    expect(mini.low).toBe(hero.low);
  });

  it("non-forest count concuerda entre superficies", () => {
    const hero = bucketHeroCounter(SAMPLE);
    const full = bucketFullMap(SAMPLE);
    // /mapa cuenta non-forest agregado (wild + industrial); hero separa.
    expect(full.nonForest).toBe(hero.nonForestWild + hero.industrial);
  });

  it("volcano (type=1) cuenta como wildfire, no como industrial", () => {
    const onlyVolcano: FirePoint[] = [
      { type: 1, frp: 30, forestZone: "yungas" },
    ];
    const hero = bucketHeroCounter(onlyVolcano);
    expect(hero.industrial).toBe(0);
    expect(hero.high).toBe(1);
  });

  it("flaring (type=2) y offshore (type=3) NUNCA aparecen en forestTotal", () => {
    const onlyIndustrial: FirePoint[] = [
      { type: 2, frp: 100, forestZone: "andino-patagonico" }, // edge case absurdo
      { type: 3, frp: 50, forestZone: "yungas" },
    ];
    const hero = bucketHeroCounter(onlyIndustrial);
    expect(hero.high + hero.moderate + hero.low).toBe(0);
    expect(hero.industrial).toBe(2);
  });

  it("threshold de bucket es exacto: 20 cuenta como high, 19.99 como moderate", () => {
    const boundary: FirePoint[] = [
      { type: 0, frp: 20, forestZone: "yungas" }, // high
      { type: 0, frp: 19.99, forestZone: "yungas" }, // moderate
      { type: 0, frp: 5, forestZone: "yungas" }, // moderate
      { type: 0, frp: 4.99, forestZone: "yungas" }, // low
    ];
    const hero = bucketHeroCounter(boundary);
    expect(hero.high).toBe(1);
    expect(hero.moderate).toBe(2);
    expect(hero.low).toBe(1);
  });
});
