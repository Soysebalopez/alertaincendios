/**
 * Las fuentes de focos de NASA FIRMS que usa AlertaForestal. Puro, sin I/O.
 *
 * El sensor VIIRS vuela en tres satélites de órbita polar que pasan por
 * Argentina a distintas horas. Hasta el 2026-10-01 se pedía sólo Suomi-NPP:
 * medido ese día con el mismo recorte, Suomi-NPP trajo 93 detecciones,
 * NOAA-20 97 y NOAA-21 72. Con los tres, el próximo pase llega antes.
 *
 * El camino de producción (pg_cron) pide estas mismas tres:
 * `scripts/sql/whi-viirs-tres-satelites.sql`. Un test compara las dos listas.
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

/** Nombre legible. Un foco sin satélite es anterior al 1/10: Suomi-NPP. */
export function satelliteLabel(code: string | undefined): string {
  const c = code ?? "N";
  return SATELLITE_LABEL[c] ?? c;
}
