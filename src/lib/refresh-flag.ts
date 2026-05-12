/**
 * Coordinación entre HeroAutoRefresh y HeroRefreshFlash. Vive en un módulo
 * neutral para romper el ciclo de imports que existió hasta PR #22.
 *
 * Dos canales:
 *
 *   1. sessionStorage[REFRESH_FLAG_KEY] = Date.now()
 *      Sobrevive el router.refresh() para que la pill sepa que el SSR
 *      fue forzado por un evento Realtime (y no por una navegación
 *      manual del usuario).
 *
 *   2. subscribeFlash(cb) — wake-up en memoria
 *      router.refresh() es soft (no remonta los client components), así
 *      que sin una notificación explícita la pill no se entera de un
 *      nuevo flash. HeroAutoRefresh llama a flagFlashAvailable() antes
 *      de cada refresh; los listeners ejecutan y vuelven a leer
 *      sessionStorage.
 */

/** Clave de sessionStorage que HeroAutoRefresh escribe antes de
 *  router.refresh() y HeroRefreshFlash consume al montar. */
export const REFRESH_FLAG_KEY = "clara-just-refreshed-at";

/** Si el flag tiene más de 30s, lo ignoramos — fue de otra sesión o de un
 *  refresh que ya nadie está mirando. Evita que el flash aparezca al
 *  volver a un tab inactivo días después. */
export const FLAG_MAX_AGE_MS = 30_000;

const listeners = new Set<() => void>();

/** Llamado por HeroAutoRefresh justo antes de router.refresh() para
 *  despertar a HeroRefreshFlash. */
export function flagFlashAvailable(): void {
  listeners.forEach((cb) => cb());
}

export function subscribeFlash(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
