/**
 * Grassfire forward-spread estimate (WHI-907 part 5).
 *
 * CSIRO PyroPage 33 (Sep 2022): in cured grass under dry, windy conditions the
 * head fire advances at ~20% of the average 10-m open wind speed. Applicable
 * only to grassland (never to fires inside a forest zone), with wind > 30 km/h,
 * curing > 90% (not measured: assumed only November to April) and dead fuel
 * moisture < 6%. It is a near-worst case: gust surges can be several times
 * faster for short periods. Outside those conditions we return null instead
 * of inventing a number.
 */
export const CSIRO_MIN_WIND_KMH = 30;
export const CSIRO_MAX_DEAD_FUEL_MOISTURE_PCT = 6;
export const CSIRO_SPREAD_FRACTION_OF_WIND = 0.2;

/** Dead fine fuel moisture (%) — Cheney, Gould & Catchpole (1998). */
export function deadFuelMoisturePct(tempC: number, rhPct: number): number {
  return 9.58 - 0.205 * tempC + 0.138 * rhPct;
}

export function csiroConditionsMet(w: {
  windKmh: number;
  tempC: number;
  rhPct: number | null;
}): boolean {
  if (w.rhPct === null) return false;
  return (
    w.windKmh > CSIRO_MIN_WIND_KMH &&
    deadFuelMoisturePct(w.tempC, w.rhPct) < CSIRO_MAX_DEAD_FUEL_MOISTURE_PCT
  );
}

const ARGENTINA_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  timeZone: "America/Argentina/Buenos_Aires",
});

/** November to April in Argentina: when grass is assumed cured enough for the rule. */
export function isGrassCuringSeason(at: Date): boolean {
  const month = Number(ARGENTINA_MONTH.format(at));
  return month >= 11 || month <= 4;
}

export function grassFireFrontEtaMinutes(i: {
  distKm: number;
  windKmh: number;
  tempC: number;
  rhPct: number | null;
  /** Outside every forest zone: this is a grassland rule. */
  grassland: boolean;
  at: Date;
}): number | null {
  if (!i.grassland || !isGrassCuringSeason(i.at) || !csiroConditionsMet(i)) return null;
  const spreadKmh = CSIRO_SPREAD_FRACTION_OF_WIND * i.windKmh;
  return Math.round((i.distKm / spreadKmh) * 60);
}

/**
 * The front line of a Telegram alert: only when the wind pushes the fire toward
 * the subscriber, and only for a grassland fire (outside every forest zone).
 */
export function alertFrontEtaMinutes(i: {
  headsToward: boolean;
  distKm: number;
  wind: { windSpeed: number; temperature: number; relativeHumidity: number | null };
  forestZone?: string;
  at: Date;
}): number | null {
  if (!i.headsToward) return null;
  return grassFireFrontEtaMinutes({
    distKm: i.distKm,
    windKmh: i.wind.windSpeed,
    tempC: i.wind.temperature,
    rhPct: i.wind.relativeHumidity,
    grassland: !i.forestZone,
    at: i.at,
  });
}

export function formatFrontEta(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 10) * 10;
  return m === 0 ? `~${h} h` : `~${h} h ${m} min`;
}
