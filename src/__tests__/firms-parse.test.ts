/**
 * Parser del CSV de FIRMS (camino manual, `syncFiresFromFirms`). Las líneas son
 * reales, del 2026-10-01: los tres satélites traen el mismo encabezado y se
 * distinguen por la columna `satellite`.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/forest-zones-geo", () => ({ findForestZone: () => null }));

import { parseFirmsCSV, dedupFires } from "@/lib/firms";

const HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

describe("parseFirmsCSV", () => {
  it("🔴 guarda el satélite de cada detección", () => {
    const csv = [
      HEADER,
      "-35.65749,-65.17178,304.86,0.75,0.77,2026-10-01,421,N,VIIRS,n,2.0NRT,276.01,2.06,N",
      "-25.48275,-59.99322,306.05,0.61,0.54,2026-10-01,438,N20,VIIRS,n,2.0NRT,286.7,1.18,N",
      "-29.65276,-67.43078,310.25,0.42,0.38,2026-10-01,523,N21,VIIRS,h,2.0NRT,284.76,0.9,N\r",
    ].join("\n");
    const fires = parseFirmsCSV(csv);
    expect(fires.map((f) => f.satellite)).toEqual(["N", "N20", "N21"]);
    expect(fires[1]).toMatchObject({ latitude: -25.48275, longitude: -59.99322, acqTime: "438", frp: 1.18 });
  });

  it("descarta confianza baja, como siempre", () => {
    const csv = [HEADER, "-35.6,-65.1,304.86,0.75,0.77,2026-10-01,421,N20,VIIRS,l,2.0NRT,276.01,2.06,N"].join("\n");
    expect(parseFirmsCSV(csv)).toEqual([]);
  });
});

describe("dedupFires", () => {
  const f = { latitude: -35.6, longitude: -65.1, brightness: 300, confidence: "n", acqDate: "2026-10-01", acqTime: "421", frp: 2, type: 0 };
  it("junta la misma detección repetida", () => {
    expect(dedupFires([{ ...f, satellite: "N" }, { ...f, satellite: "N" }])).toHaveLength(1);
  });
  it("🔴 nunca junta detecciones de satélites distintos", () => {
    expect(dedupFires([{ ...f, satellite: "N" }, { ...f, satellite: "N20" }])).toHaveLength(2);
  });
  it("un foco viejo sin satélite es de Suomi-NPP", () => {
    expect(dedupFires([f, { ...f, satellite: "N" }])).toHaveLength(1);
  });
});
