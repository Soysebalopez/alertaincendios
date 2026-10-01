/**
 * Capa "campo y pastizal" (Seba, 2026-09-28).
 *
 * El bot avisa de focos en las 7 zonas de bosque (`alert-pairs.ts`), y eso NO
 * cambia. Esta capa suma, aparte, los incendios de pastizal, campo, arbustal y
 * quemas agrícolas FUERA de esas zonas, en toda Argentina, incluidas las
 * ciudades, sin fuentes industriales.
 *
 * Los números los eligió Seba sobre lo medido con el archivo FIRMS 2023–2024
 * (79 ciudades, un aviso por incendio):
 *
 *   radio 100 km, todo       → ciudad típica 135 avisos/año, peor 2.097
 *   radio  20 km, todo       → 8,5 / año, peor 360 (Concepción, Tucumán)
 *   radio  20 km, FRP > 10   → 1,5 / año, peor 72   ← ELEGIDO
 *
 * Un aviso que llega siempre deja de leerse, y en una alerta de incendio eso es
 * lo peor que puede pasar. Por eso el radio es chico y sólo pasan fuegos
 * intensos: casi toda la quema chica de rastrojo y basura queda afuera.
 *
 * Viene PRENDIDA para todos (`subscribers.campo_enabled`, default true) y cada
 * uno la puede apagar con /campo o desde el menú de preferencias.
 */
import { haversineKm } from "@/lib/geo";
import { isStaticHeatSource } from "@/lib/static-heat-sources";
import {
  INCIDENT_HOURS,
  INCIDENT_KM,
  posicionDeClave as posicionConPrefijo,
  yaAvisadoMismoIncendio as mismoIncendio,
} from "@/lib/fire-incident";

/** Distancia máxima al suscriptor. */
export const CAMPO_RADIUS_KM = 20;
/** Potencia mínima (MW): "fuego intenso". Iguala al umbral preliminar de GOES. */
export const CAMPO_MIN_FRP_MW = 10;
/**
 * Un incendio = detecciones a ≤ 2 km en ≤ 24 h. Con esta unión se midieron los
 * volúmenes de arriba; avisar por detección los triplicaba. Desde el 1/10 el
 * criterio vive en `fire-incident.ts`, compartido con la capa de bosque.
 */
export const CAMPO_INCIDENT_KM = INCIDENT_KM;
export const CAMPO_INCIDENT_HOURS = INCIDENT_HOURS;

/** Prefijo de sus filas en `ai_alerted_fires`: no se mezclan con las de bosque. */
export const CAMPO_KEY_PREFIX = "c:";

export interface CampoFire {
  latitude: number;
  longitude: number;
  frp: number;
  acqDate: string;
  forestZone?: string;
}

export interface CampoSubscriber {
  chat_id: number;
  lat: number;
  lng: number;
  campo_enabled?: boolean | null;
}

/** ¿Este foco es de la capa de campo? Fuera de bosque, intenso y no industrial. */
export function esFocoDeCampo(fire: CampoFire): boolean {
  if (fire.forestZone) return false; // lo avisa la capa de bosque, como siempre
  if (!(fire.frp > CAMPO_MIN_FRP_MW)) return false;
  return !isStaticHeatSource(fire.latitude, fire.longitude);
}

/**
 * Los pares (foco, suscriptor) que valen un aviso. Filtros baratos primero,
 * como en `alert-pairs.ts`: nada acá toca la base.
 */
export function selectCampoPairs<F extends CampoFire, S extends CampoSubscriber>(
  fires: F[],
  subscribers: S[]
): { fire: F; sub: S; distKm: number }[] {
  const out: { fire: F; sub: S; distKm: number }[] = [];
  const focos = fires.filter(esFocoDeCampo);
  for (const fire of focos) {
    for (const sub of subscribers) {
      if (sub.campo_enabled === false) continue;
      const distKm = haversineKm(sub.lat, sub.lng, fire.latitude, fire.longitude);
      if (distKm <= CAMPO_RADIUS_KM) out.push({ fire, sub, distKm });
    }
  }
  return out;
}

/** Clave de dedup de un foco de campo (misma forma que la de bosque, con prefijo). */
export function campoFireKey(fire: CampoFire): string {
  return `${CAMPO_KEY_PREFIX}${fire.latitude.toFixed(3)}_${fire.longitude.toFixed(3)}_${fire.acqDate}`;
}

/** Lee lat/lng de una clave de campo; null si no es una. */
export function posicionDeClave(key: string): { lat: number; lng: number } | null {
  return posicionConPrefijo(key, CAMPO_KEY_PREFIX);
}

/**
 * ¿Ya le avisamos a esta persona de ESTE incendio? Sí, si en las últimas 24 h
 * recibió un aviso de campo por un foco a ≤ 2 km. Así las varias detecciones de
 * un mismo incendio llegan como un solo aviso.
 *
 * `recientes` son sus claves de campo de las últimas 24 h (de `ai_alerted_fires`).
 */
export function yaAvisadoMismoIncendio(fire: CampoFire, recientes: string[]): boolean {
  return mismoIncendio(fire, recientes, CAMPO_KEY_PREFIX);
}
