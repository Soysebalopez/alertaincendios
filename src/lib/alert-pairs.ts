/**
 * Selección de pares (foco, suscriptor) para /api/alerts. Puro — sin I/O.
 *
 * 🔴 POR QUÉ ESTO ES UNA FUNCIÓN Y NO DOS LÍNEAS DENTRO DEL LOOP.
 *
 * Hasta el 2026-09-04 el endpoint preguntaba a la base "¿ya alerté este foco?"
 * ANTES de mirar la distancia. Medido contra producción ese día: 188 focos
 * forestales × 3 suscriptores = 564 consultas secuenciales para no mandar ni
 * una alerta — ninguno estaba a menos de 100 km de nadie. Las 6 corridas
 * siguientes del cron se cortaron a los 60 s (timeout de pg_net).
 *
 * El filtro barato (una cuenta trigonométrica, microsegundos) estaba después
 * del caro (ida y vuelta a Postgres, ~100 ms). Invertirlos alcanzaba para hoy,
 * pero deja el orden como algo que hay que recordar. Extraerlo hace que el
 * bucle que toca la base reciba ÚNICAMENTE pares que ya valen la pena: el
 * error deja de ser posible en vez de quedar vigilado.
 *
 * El costo crece de forma multiplicativa (focos × suscriptores), así que esto
 * empeora justo cuando más importa: en plena temporada y con más gente.
 */

import { haversineKm } from "./geo";

/** Radio máximo para alertar. Fuera de esto el foco no le importa a nadie. */
export const ALERT_MAX_DISTANCE_KM = 100;

/** Lo mínimo que necesita esta decisión de un foco. */
export interface AlertableFire {
  latitude: number;
  longitude: number;
  /** Id de zona forestal, si el foco cae dentro de una. */
  forestZone?: string;
}

/** Lo mínimo que necesita esta decisión de un suscriptor. */
export interface AlertableSubscriber {
  lat: number;
  lng: number;
  role?: string;
}

export interface AlertPair<F, S> {
  fire: F;
  sub: S;
  /** Ya calculada acá — el llamador no la vuelve a computar. */
  distKm: number;
}

export interface AlertPairSelection<F, S> {
  pairs: AlertPair<F, S>[];
  /**
   * WHI-758: pares (foco, civil) descartados porque el foco no cae en zona
   * forestal. Se reporta en la respuesta del cron para ver el efecto del filtro.
   */
  skippedNonForestCivilian: number;
}

/**
 * WHI-758: el civil recibe sólo focos en zona forestal; el bombero recibe
 * todo, porque el cuartel necesita la vista completa para coordinar respuesta.
 * M7: un rol desconocido cae en civil — filtrar de MENOS a alguien por un rol
 * nuevo sería mandarle ruido, filtrar de más es no avisarle. Preferimos lo
 * primero, y el llamador loguea el rol raro.
 */
function receivesNonForestFires(role: string | undefined): boolean {
  return role === "fireman";
}

/**
 * Devuelve los pares que merecen una consulta a la base, con la distancia ya
 * resuelta. Ambos filtros son puro cálculo local: ninguno toca la red.
 */
export function selectAlertPairs<F extends AlertableFire, S extends AlertableSubscriber>(
  fires: F[],
  subscribers: S[],
  maxDistanceKm: number = ALERT_MAX_DISTANCE_KM
): AlertPairSelection<F, S> {
  const pairs: AlertPair<F, S>[] = [];
  let skippedNonForestCivilian = 0;

  for (const fire of fires) {
    for (const sub of subscribers) {
      if (!fire.forestZone && !receivesNonForestFires(sub.role)) {
        skippedNonForestCivilian++;
        continue;
      }

      const distKm = haversineKm(sub.lat, sub.lng, fire.latitude, fire.longitude);
      if (distKm > maxDistanceKm) continue;

      pairs.push({ fire, sub, distKm });
    }
  }

  return { pairs, skippedNonForestCivilian };
}
