/**
 * Un aviso por INCIDENTE, no por detección. Puro — sin I/O.
 *
 * 🔴 POR QUÉ LO NECESITA TAMBIÉN LA CAPA DE BOSQUE (2026-10-01).
 *
 * La clave de dedup de `/api/alerts` es la posición del foco redondeada a
 * ~111 m + el día. Eso junta las detecciones de un mismo píxel, pero no las de
 * un mismo incendio: VIIRS ve un fuego como varios píxeles de 375 m, y cada
 * satélite tiene su propia grilla. Desde el 1/10 se piden los TRES satélites con
 * VIIRS (Suomi-NPP, NOAA-20 y NOAA-21), así que el mismo incendio llega en tres
 * pasadas con coordenadas distintas — y con la clave sola, tres avisos.
 *
 * Un aviso que llega repetido deja de leerse, y en una alerta de incendio eso es
 * lo peor que puede pasar. La capa de campo ya agrupaba por incidente desde el
 * 28/9 (con la clave sola sus volúmenes se triplicaban); este módulo es ese
 * mismo criterio, compartido por las dos capas.
 *
 * Un incendio = detecciones a ≤ 2 km en ≤ 24 h. Es el radio de
 * `fire-events.ts` (el contador de la home), con el que también se midieron los
 * volúmenes de la capa de campo.
 */
import { haversineKm } from "./geo";

export const INCIDENT_KM = 2;
export const INCIDENT_HOURS = 24;

export interface IncidentFire {
  latitude: number;
  longitude: number;
}

/**
 * Lee lat/lng de una clave de dedup `"<prefijo><lat>_<lng>_<fecha>"`; null si
 * no tiene ese prefijo o no es una posición. Las claves de bosque no llevan
 * prefijo (`""`) y empiezan con un número: así una de campo ("c:…") nunca se
 * lee como de bosque.
 */
export function posicionDeClave(
  key: string,
  prefix: string
): { lat: number; lng: number } | null {
  if (!key.startsWith(prefix)) return null;
  const resto = key.slice(prefix.length);
  if (!/^-?\d/.test(resto)) return null;
  const [lat, lng] = resto.split("_").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * ¿Ya le avisamos a esta persona de ESTE incendio? Sí, si alguna de sus claves
 * recientes (las de las últimas `INCIDENT_HOURS`, con este prefijo) está a
 * ≤ `INCIDENT_KM` del foco.
 */
export function yaAvisadoMismoIncendio(
  fire: IncidentFire,
  recientes: string[],
  prefix: string
): boolean {
  return recientes.some((k) => {
    const p = posicionDeClave(k, prefix);
    return p != null && haversineKm(p.lat, p.lng, fire.latitude, fire.longitude) <= INCIDENT_KM;
  });
}
