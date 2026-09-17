/**
 * De detecciones de satélite a incendios.
 *
 * VIIRS ve un mismo fuego como varios píxeles de 375 m, y en cada pasada lo
 * vuelve a ver. Medido el 17/9/2026: las 426 detecciones forestales de ese día
 * eran 217 incendios distintos, y 123 de ellos un solo punto. Contar
 * detecciones y llamarlas "incendios" multiplica el número por dos.
 *
 * Agrupamos por cercanía (enlace simple): dos detecciones a menos de
 * FIRE_EVENT_RADIUS_KM son el mismo fuego, y eso se propaga en cadena. Es el
 * mismo criterio con el que se midió el volumen de avisos para Bahía Blanca.
 */
import { haversineKm } from "@/lib/geo";

/** Dos detecciones a menos de esta distancia son el mismo incendio. */
export const FIRE_EVENT_RADIUS_KM = 2;

export interface EventFire {
  latitude: number;
  longitude: number;
  /** VIIRS: 0 vegetación, 1 volcán, 2 fuente industrial fija, 3 offshore. */
  type?: number;
  forestZone?: string;
}

/** Incendio de vegetación dentro de una zona forestal — lo que cuenta la home. */
export function isForestFire(fire: EventFire): boolean {
  const isWild = (fire.type ?? 0) === 0 || fire.type === 1;
  return isWild && Boolean(fire.forestZone);
}

/** Cuántos incendios distintos representan estas detecciones. */
export function countFireEvents(
  fires: EventFire[],
  radiusKm: number = FIRE_EVENT_RADIUS_KM,
): number {
  const parent = fires.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };

  for (let i = 0; i < fires.length; i++) {
    for (let j = i + 1; j < fires.length; j++) {
      const d = haversineKm(
        fires[i].latitude,
        fires[i].longitude,
        fires[j].latitude,
        fires[j].longitude,
      );
      if (d > radiusKm) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[b] = a;
    }
  }

  const roots = new Set<number>();
  for (let i = 0; i < fires.length; i++) roots.add(find(i));
  return roots.size;
}

/** Incendios forestales distintos entre estas detecciones. */
export function countForestFireEvents(
  fires: EventFire[],
  radiusKm: number = FIRE_EVENT_RADIUS_KM,
): number {
  return countFireEvents(fires.filter(isForestFire), radiusKm);
}
