/**
 * Los tres satélites con VIIRS (2026-10-01).
 *
 * Hasta ese día se pedía sólo Suomi-NPP. Sumar NOAA-20 y NOAA-21 hace que un
 * incendio se vea antes, pero trae dos efectos de rebote que estos tests
 * vigilan: el mismo incendio llega tres veces (no puede generar tres avisos ni
 * listarse tres veces), y un satélite puede caerse sin que el caché envejezca
 * (el monitor tiene que enterarse igual).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { FIRMS_VIIRS_SOURCES, VIIRS_SATELLITES, satelliteLabel } from "@/lib/viirs-sources";
import { posicionDeClave, yaAvisadoMismoIncendio } from "@/lib/fire-incident";
import { yaAvisadoMismoIncendio as yaAvisadoCampo, campoFireKey } from "@/lib/campo-alerts";
import { onePerFire, countFireEvents } from "@/lib/fire-events";
import {
  decideSourceActions,
  buildSourceStaleAlert,
  buildSourceRecoveredAlert,
} from "@/lib/fires-freshness";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// Detecciones reales del 2026-10-01 tienen esta forma. Acá, un mismo incendio
// visto por los tres satélites: cada uno con su grilla, a unos cientos de metros.
const SNPP = { latitude: -26.1208, longitude: -60.9222, acqDate: "2026-10-01", satellite: "N" };
const N20 = { latitude: -26.1231, longitude: -60.9187, acqDate: "2026-10-01", satellite: "N20" };
const N21 = { latitude: -26.1189, longitude: -60.9259, acqDate: "2026-10-01", satellite: "N21" };
// Clave de bosque, mismo formato que buildFireKey en /api/alerts.
const claveBosque = (f: { latitude: number; longitude: number; acqDate: string }) =>
  `${f.latitude.toFixed(3)}_${f.longitude.toFixed(3)}_${f.acqDate}`;

describe("la app y la base piden las MISMAS tres fuentes", () => {
  it("🔴 el SQL de producción pide exactamente FIRMS_VIIRS_SOURCES", () => {
    const sql = leer("scripts/sql/whi-viirs-tres-satelites.sql");
    const pedidas = sql.match(/array\[([^\]]+)\]/)?.[1] ?? "";
    const fuentes = [...pedidas.matchAll(/'(VIIRS_[A-Z0-9]+_NRT)'/g)].map((m) => m[1]);
    expect(fuentes).toEqual([...FIRMS_VIIRS_SOURCES]);
  });

  it("🔴 el SQL traduce cada fuente al código de satélite de la app", () => {
    const sql = leer("scripts/sql/whi-viirs-tres-satelites.sql");
    const pares = [...sql.matchAll(/when '(VIIRS_[A-Z0-9]+_NRT)'\s+then '([A-Z0-9]+)'/g)].map(
      (m) => [m[1], m[2]]
    );
    expect(pares).toEqual(FIRMS_VIIRS_SOURCES.map((s, i) => [s, VIIRS_SATELLITES[i]]));
  });

  it("🔴 lib/firms.ts no tiene una fuente escrita a mano", () => {
    expect(leer("src/lib/firms.ts")).not.toMatch(/VIIRS_[A-Z0-9]+_NRT/);
  });
});

describe("nombres de los satélites", () => {
  it("los tres códigos del CSV de NASA tienen nombre", () => {
    expect(VIIRS_SATELLITES.map(satelliteLabel)).toEqual(["Suomi-NPP", "NOAA-20", "NOAA-21"]);
  });
  it("un foco sin satélite es anterior al 1/10, o sea de Suomi-NPP", () => {
    expect(satelliteLabel(undefined)).toBe("Suomi-NPP");
  });
});

describe("un aviso de bosque por INCIDENTE", () => {
  it("🔴 el mismo incendio visto por los tres satélites: un solo aviso", () => {
    // Las tres claves exactas son distintas: con la dedup vieja eran 3 avisos.
    expect(new Set([SNPP, N20, N21].map(claveBosque)).size).toBe(3);

    const recientes: string[] = [];
    let avisos = 0;
    for (const f of [SNPP, N20, N21]) {
      if (yaAvisadoMismoIncendio(f, recientes, "")) continue;
      recientes.push(claveBosque(f));
      avisos++;
    }
    expect(avisos).toBe(1);
  });

  it("un incendio a más de 2 km es otro incendio: avisa", () => {
    const lejos = { ...SNPP, latitude: SNPP.latitude - 0.03 }; // ~3,3 km al sur
    expect(yaAvisadoMismoIncendio(lejos, [claveBosque(SNPP)], "")).toBe(false);
  });

  it("🔴 una clave de CAMPO no cuenta como aviso de bosque (ni al revés)", () => {
    const deCampo = campoFireKey({ ...SNPP, frp: 30 });
    expect(posicionDeClave(deCampo, "")).toBeNull();
    expect(yaAvisadoMismoIncendio(N20, [deCampo], "")).toBe(false);
    expect(yaAvisadoCampo({ ...N20, frp: 30 }, [claveBosque(SNPP)])).toBe(false);
  });

  it("lee de vuelta la clave de bosque", () => {
    expect(posicionDeClave("-26.121_-60.922_2026-10-01", "")).toEqual({ lat: -26.121, lng: -60.922 });
  });

  it("🔴 /api/alerts mira el incidente ANTES de reclamar el aviso", () => {
    const ruta = leer("src/app/api/alerts/route.ts");
    const chequeo = ruta.indexOf("yaAvisadoMismoIncendioDeBosque(fire, recientes");
    const reclamo = ruta.indexOf('.from("ai_alerted_fires")\n        .insert(');
    expect(chequeo).toBeGreaterThan(0);
    expect(reclamo).toBeGreaterThan(chequeo);
    // Y lo anota al avisar, para la próxima detección de la misma corrida.
    expect(ruta.indexOf("recientes.push(fireKey)")).toBeGreaterThan(reclamo);
  });
});

describe("listar uno por incendio", () => {
  it("🔴 tres detecciones del mismo fuego se listan una vez, la primera del orden", () => {
    expect(onePerFire([SNPP, N20, N21])).toEqual([SNPP]);
    expect(countFireEvents([SNPP, N20, N21])).toBe(1);
  });
  it("dos incendios separados se listan los dos", () => {
    const otro = { ...SNPP, latitude: -27 };
    expect(onePerFire([SNPP, N20, otro, N21])).toEqual([SNPP, otro]);
  });
  it("🔴 el /estado del bot cuenta incendios, no detecciones", () => {
    const bot = leer("src/app/api/bot/telegram/route.ts");
    expect(bot).toContain("countFireEvents(nearby)");
    expect(bot).not.toMatch(/\$\{nearby\.length\} foco/);
  });
});

describe("aviso por satélite caído", () => {
  const AHORA = Date.parse("2026-10-01T15:00:00Z");
  const hace = (min: number) => new Date(AHORA - min * 60000).toISOString();
  const base = { nowMs: AHORA, thresholdMinutes: 60 };

  it("los tres al día: nada", () => {
    const r = decideSourceActions({ ...base, lastOkBySource: { N: hace(5), N20: hace(5), N21: hace(5) }, alerted: [] });
    expect(r).toEqual({ alert: [], recovered: [] });
  });

  it("🔴 NOAA-21 sin dato bueno hace 2 h: avisa SÓLO de NOAA-21", () => {
    const r = decideSourceActions({ ...base, lastOkBySource: { N: hace(5), N20: hace(5), N21: hace(120) }, alerted: [] });
    expect(r).toEqual({ alert: ["N21"], recovered: [] });
  });

  it("ya avisado: no repite", () => {
    const r = decideSourceActions({ ...base, lastOkBySource: { N: hace(5), N20: hace(5), N21: hace(120) }, alerted: ["N21"] });
    expect(r).toEqual({ alert: [], recovered: [] });
  });

  it("volvió: da por recuperado", () => {
    const r = decideSourceActions({ ...base, lastOkBySource: { N: hace(5), N20: hace(5), N21: hace(5) }, alerted: ["N21"] });
    expect(r).toEqual({ alert: [], recovered: ["N21"] });
  });

  it("🔴 una fuente que NUNCA trajo dato (sin anotación) cuenta como caída", () => {
    const r = decideSourceActions({ ...base, lastOkBySource: { N: hace(5), N20: hace(5) }, alerted: [] });
    expect(r.alert).toEqual(["N21"]);
  });

  it("🔴 sin ninguna anotación (el sync nuevo no corrió todavía): no inventa una caída", () => {
    expect(decideSourceActions({ ...base, lastOkBySource: {}, alerted: [] })).toEqual({ alert: [], recovered: [] });
    expect(decideSourceActions({ ...base, lastOkBySource: null, alerted: [] })).toEqual({ alert: [], recovered: [] });
  });

  it("el aviso nombra al satélite y su último dato bueno", () => {
    const msg = buildSourceStaleAlert({ sources: ["N21"], lastOkBySource: { N21: hace(120) } });
    expect(msg).toContain("NOAA-21");
    expect(msg).toContain(hace(120));
    expect(msg).toContain("siguen funcionando con los otros satélites");
    expect(buildSourceRecoveredAlert({ sources: ["N21"] })).toContain("NOAA-21");
  });

  it("🔴 el monitor no avisa por satélite si no pudo leer el estado, ni encima del aviso general", () => {
    const ruta = leer("src/app/api/monitor/fires-freshness/route.ts");
    expect(ruta).toMatch(/syncStateError \|\| cacheError \|\| keyError \|\| stale\s*\?/);
  });
});
