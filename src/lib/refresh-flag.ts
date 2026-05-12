/**
 * Coordinación entre HeroAutoRefresh y HeroRefreshFlash.
 *
 * Antes esto vivía split entre los dos archivos de componente y se importaba
 * cruzado, generando un ciclo TS → Turbopack lo resolvía dejando uno de los
 * imports temporalmente undefined, lo cual hacía que el primer mount de
 * HeroAutoRefresh tirara `ReferenceError: Cannot access X before
 * initialization` y React dejara el componente sin hidratar — silenciando
 * la subscripción Realtime. Mover ambos símbolos a un módulo neutral rompe
 * el ciclo.
 *
 * Hay dos canales de coordinación entre los componentes:
 *
 *   1. sessionStorage[REFRESH_FLAG_KEY] = Date.now()
 *      Sobrevive el router.refresh() para que la pill sepa que el SSR
 *      fue forzado por un evento Realtime (y no por una navegación
 *      manual del usuario).
 *
 *   2. flagFlashAvailable() — wake-up en memoria
 *      router.refresh() es soft (no remonta los client components), así
 *      que sin una notificación explícita useSyncExternalStore se queda
 *      con el snapshot cacheado. flagFlashAvailable() bumpea la version
 *      y dispara los listeners.
 */

/** Clave de sessionStorage que HeroAutoRefresh escribe antes de
 *  router.refresh() y HeroRefreshFlash consume al montar. */
export const REFRESH_FLAG_KEY = "clara-just-refreshed-at";

/** Si el flag tiene más de 30s, lo ignoramos — fue de otra sesión o de un
 *  refresh que ya nadie está mirando. Evita que el flash aparezca al
 *  volver a un tab inactivo días después. */
export const FLAG_MAX_AGE_MS = 30_000;

// ─── Store en memoria compartido ───
let version = 0;
let cached: boolean | null = null;
const listeners = new Set<() => void>();

/** Llamado por HeroAutoRefresh justo antes de router.refresh() para que
 *  HeroRefreshFlash releea sessionStorage y dispare la animación. */
export function flagFlashAvailable(): void {
  version++;
  cached = null;
  listeners.forEach((cb) => cb());
}

/** Versión actual del store — la usa HeroRefreshFlash como key para
 *  forzar unmount+remount entre flashes consecutivos (re-arranca la
 *  animación CSS desde 0). */
export function getFlashVersion(): number {
  return version;
}

export function subscribeFlash(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getFlashSnapshot(): boolean {
  if (cached !== null) return cached;
  try {
    const raw = sessionStorage.getItem(REFRESH_FLAG_KEY);
    if (!raw) {
      cached = false;
      return false;
    }
    const at = Number(raw);
    sessionStorage.removeItem(REFRESH_FLAG_KEY);
    cached = Number.isFinite(at) && Date.now() - at <= FLAG_MAX_AGE_MS;
    return cached;
  } catch {
    cached = false;
    return false;
  }
}

export const getFlashServerSnapshot = (): boolean => false;
