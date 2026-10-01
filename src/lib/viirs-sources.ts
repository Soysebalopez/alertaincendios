/**
 * Las fuentes de focos de NASA FIRMS que usa AlertaForestal. Puro, sin I/O.
 *
 * El sensor VIIRS vuela en tres satélites de órbita polar que pasan por
 * Argentina a distintas horas. Hasta el 2026-10-01 se pedía sólo Suomi-NPP:
 * medido ese día con el mismo recorte, Suomi-NPP trajo 93 detecciones,
 * NOAA-20 97 y NOAA-21 72. Con los tres, el próximo pase llega antes.
 *
 * El camino de producción (pg_cron) pide estas mismas tres:
 * `scripts/sql/whi-retiro-suomi-npp.sql`. Un test compara las dos listas.
 * Suomi-NPP se retira el 1/11/2026: ver `SUOMI_NPP_RETIRED_AT`.
 */

/** Nombres de producto de la API de área de FIRMS (casi en tiempo real). */
export const FIRMS_VIIRS_SOURCES = [
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
] as const;

/**
 * Código de cada satélite tal como lo escribe NASA en la columna `satellite`
 * del CSV. Es lo que se guarda en cada foco (`FirePoint.satellite`).
 */
export const VIIRS_SATELLITES = ["N", "N20", "N21"] as const;

const SATELLITE_LABEL: Record<string, string> = {
  N: "Suomi-NPP",
  N20: "NOAA-20",
  N21: "NOAA-21",
};

/**
 * 🔴 Suomi-NPP deja de entregar datos el 2026-11-01 a las 13:00 UTC (anuncio
 * de NASA/NOAA del 2026-08-03). Desde esa hora no se pide, no se vigila y no
 * se dibuja su pase. La misma fecha está escrita en la base
 * (`scripts/sql/whi-retiro-suomi-npp.sql`, paso 1); un test compara las dos.
 */
export const SUOMI_NPP_RETIRED_AT = Date.parse("2026-11-01T13:00:00Z");

/** NORAD de Suomi-NPP, para sacarlo de los pases del mapa tras el retiro. */
export const SUOMI_NPP_NORAD_ID = 37849;

const retirado = (nowMs: number) => nowMs >= SUOMI_NPP_RETIRED_AT;

/** Las fuentes que se piden a NASA en este momento. */
export function activeFirmsSources(nowMs: number = Date.now()): string[] {
  return FIRMS_VIIRS_SOURCES.filter((s) => !(s === "VIIRS_SNPP_NRT" && retirado(nowMs)));
}

/** Los satélites que entregan datos en este momento (códigos del CSV). */
export function activeViirsSatellites(nowMs: number = Date.now()): string[] {
  return VIIRS_SATELLITES.filter((s) => !(s === "N" && retirado(nowMs)));
}

/** ¿Este satélite (NORAD) sigue entregando datos? */
export function isActiveViirsNorad(noradId: number, nowMs: number = Date.now()): boolean {
  return !(noradId === SUOMI_NPP_NORAD_ID && retirado(nowMs));
}

/** Nombre legible. Un foco sin satélite es anterior al 1/10: Suomi-NPP. */
export function satelliteLabel(code: string | undefined): string {
  const c = code ?? "N";
  return SATELLITE_LABEL[c] ?? c;
}
