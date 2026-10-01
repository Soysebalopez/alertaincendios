/**
 * Qué focos muestra la web, y cómo se clasifican. Puro — sin I/O.
 *
 * 🔴 DESDE EL 2026-10-01 LA WEB MUESTRA TODO INCENDIO, NO SÓLO LOS FORESTALES.
 *
 * Hasta ese día la home, el mapa y las páginas de ciudad mostraban sólo focos
 * en las 7 zonas de bosque (WHI-757); lo demás quedaba detrás de un botón como
 * "fuera de zona forestal", mezclado con chimeneas y antorchas. Seba pidió
 * informar todo incendio —bosque, pastizal, campo, quemas— salvo las fuentes
 * fijas de calor que no son incendios. Bahía Blanca ya funcionaba así desde
 * WHI-907.
 *
 * Tres clases, y una sola función que las decide para las tres pantallas (home,
 * mini mapa, /mapa). Antes cada una tenía su propia copia del filtro y un test
 * que las comparaba contra réplicas escritas a mano: vigilaba las copias, no el
 * código. Ahora no hay copias que puedan separarse.
 *
 * - "bosque":   vegetación dentro de una zona forestal (o a <5 km del borde).
 * - "campo":    vegetación fuera de esas zonas: pastizal, campo, arbustal, quemas.
 * - "excluido": NO es un incendio. Lo que VIIRS o la reclasificación por cuenca
 *               petrolera marcan como industrial, volcán o costa afuera (type
 *               ≠ 0), y toda posición de la lista de fuentes fijas del archivo
 *               de NASA (antorchas, acerías, refinerías). El feed casi en tiempo
 *               real no trae `type`, por eso hace falta la lista por posición.
 */
import { isStaticHeatSource } from "./static-heat-sources";
import { groupFireEvents, FIRE_EVENT_RADIUS_KM } from "./fire-events";

export type FireKind = "bosque" | "campo" | "excluido";
export type Intensity = "high" | "moderate" | "low";

export interface ReportableFire {
  latitude: number;
  longitude: number;
  frp: number;
  /** VIIRS: 0 vegetación, 1 volcán, 2 fuente terrestre estática, 3 costa afuera. */
  type?: number;
  forestZone?: string;
}

export function fireKind(f: ReportableFire): FireKind {
  if ((f.type ?? 0) !== 0) return "excluido";
  if (isStaticHeatSource(f.latitude, f.longitude)) return "excluido";
  return f.forestZone ? "bosque" : "campo";
}

export function isReportedFire(f: ReportableFire): boolean {
  return fireKind(f) !== "excluido";
}

/** Potencia (FRP) en tres bandas. Mismos cortes que tenían las dos copias. */
export function frpBucket(frp: number): Intensity {
  if (frp >= 20) return "high";
  if (frp >= 5) return "moderate";
  return "low";
}

export interface FireEventCounts {
  /** Incendios distintos, bosque + campo: el número grande de la home. */
  total: number;
  /** Incendios con al menos una detección en zona de bosque. */
  bosque: number;
  /** El resto: campo, pastizal, quemas. */
  campo: number;
  /** Incendios por potencia: la de su detección más fuerte. */
  byIntensity: Record<Intensity, number>;
}

/**
 * Incendios distintos (no detecciones, ver `fire-events.ts`) entre los focos
 * que se informan. 🔴 TODOS los números salen del MISMO agrupamiento: un
 * incendio es de bosque si alguna de sus detecciones cae en zona de bosque, y
 * su potencia es la de su detección más fuerte. Así bosque + campo = total y
 * alta + moderada + baja = total, siempre — dos números que no suman, lado a
 * lado, se leen como un error (revisión 28/9).
 */
export function countReportedFireEvents(
  fires: ReportableFire[],
  radiusKm: number = FIRE_EVENT_RADIUS_KM,
): FireEventCounts {
  const grupos = groupFireEvents(fires.filter(isReportedFire), radiusKm);
  const out: FireEventCounts = {
    total: grupos.length,
    bosque: 0,
    campo: 0,
    byIntensity: { high: 0, moderate: 0, low: 0 },
  };
  for (const g of grupos) {
    if (g.some((f) => fireKind(f) === "bosque")) out.bosque++;
    else out.campo++;
    out.byIntensity[frpBucket(Math.max(...g.map((f) => f.frp)))]++;
  }
  return out;
}
