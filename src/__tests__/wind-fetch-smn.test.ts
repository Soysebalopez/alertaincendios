import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WHI-907 part 4 — near Bahía Blanca, fetchWind prefers the SMN WRF 4 km
 * forecast stored in `wind_forecast`; anywhere else, or when there is no
 * usable row, it keeps using Open-Meteo. The result says which source it used,
 * because the map shows it next to the smoke cone.
 */
const AT = new Date("2026-09-14T15:20:00Z");
const BAHIA = { lat: -38.72, lng: -62.27 };

const db: { rows: unknown; error: { code: string; message: string } | null; connections: number } = {
  rows: [],
  error: null,
  connections: 0,
};

function query() {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order", "limit"]) q[method] = () => q;
  q.then = (resolve: (value: { data: unknown; error: unknown }) => void) =>
    resolve({ data: db.error ? null : db.rows, error: db.error });
  return q;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => {
    db.connections += 1;
    return { from: () => query() };
  },
}));

import { fetchWind } from "@/lib/wind";

const openMeteo = vi.fn(async () =>
  new Response(
    JSON.stringify({
      current: { wind_speed_10m: 12, wind_direction_10m: 90, temperature_2m: 18, relative_humidity_2m: 70 },
    }),
    { status: 200 }
  )
);

beforeEach(() => {
  db.rows = [];
  db.error = null;
  db.connections = 0;
  openMeteo.mockClear();
  vi.stubGlobal("fetch", openMeteo);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const smnRow = {
  run_at: "2026-09-14T12:00:00Z",
  valid_at: "2026-09-14T15:00:00Z",
  lat: BAHIA.lat,
  lng: BAHIA.lng,
  wind_from_deg: 290,
  wind_kmh: 55,
  temp_c: 31,
  rh_pct: 18,
};

describe("fetchWind — SMN WRF near Bahía Blanca", () => {
  it("uses the SMN forecast row and does not call Open-Meteo", async () => {
    db.rows = [smnRow];
    expect(await fetchWind(BAHIA.lat, BAHIA.lng, AT)).toEqual({
      windSpeed: 55,
      windDirection: 290,
      temperature: 31,
      relativeHumidity: 18,
      source: "smn-wrf",
    });
    expect(openMeteo).not.toHaveBeenCalled();
  });

  it("no usable SMN row → Open-Meteo, labelled as such", async () => {
    db.rows = [{ ...smnRow, valid_at: "2026-09-14T09:00:00Z" }];
    expect(await fetchWind(BAHIA.lat, BAHIA.lng, AT)).toMatchObject({ windSpeed: 12, source: "open-meteo" });
  });

  it("the table not existing yet (migration pending) → Open-Meteo", async () => {
    db.error = { code: "PGRST205", message: "Could not find the table 'public.wind_forecast'" };
    expect(await fetchWind(BAHIA.lat, BAHIA.lng, AT)).toMatchObject({ windSpeed: 12, source: "open-meteo" });
  });

  it("far from Bahía Blanca never touches the database", async () => {
    expect(await fetchWind(-34.6, -58.38, AT)).toMatchObject({ source: "open-meteo" });
    expect(db.connections).toBe(0);
  });

  it("Open-Meteo down as well → fallback values, labelled fallback", async () => {
    openMeteo.mockRejectedValueOnce(new Error("network down"));
    expect(await fetchWind(BAHIA.lat, BAHIA.lng, AT)).toMatchObject({ source: "fallback" });
  });
});
