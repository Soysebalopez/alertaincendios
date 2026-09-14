/**
 * Observed wind from the aviationweather.gov METAR JSON API (WHI-907 part 4).
 *
 * METAR wind direction is where the wind blows FROM (same convention as
 * Open-Meteo); speeds come in knots. "VRB" means variable direction, and the
 * API omits `wgst` entirely when there are no gusts.
 */
export interface WindObservation {
  station: string;
  observedAt: string;
  windFromDeg: number | null;
  windKmh: number;
  gustKmh: number | null;
  variable: boolean;
}

const KT_TO_KMH = 1.852;

export function parseMetarRecord(record: unknown): WindObservation | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  const station = typeof r.icaoId === "string" ? r.icaoId : null;
  const observedAt = typeof r.reportTime === "string" ? r.reportTime : null;
  const speedKt = typeof r.wspd === "number" ? r.wspd : null;
  if (!station || !observedAt || speedKt === null) return null;

  const variable = r.wdir === "VRB";
  return {
    station,
    observedAt,
    windFromDeg: !variable && typeof r.wdir === "number" ? r.wdir % 360 : null,
    windKmh: speedKt * KT_TO_KMH,
    gustKmh: typeof r.wgst === "number" ? r.wgst * KT_TO_KMH : null,
    variable,
  };
}
