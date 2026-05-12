"use client";

/**
 * Pill efímera que avisa al usuario que el hero acaba de auto-refrescarse
 * con un nuevo incendio destacado. Coordinada con HeroAutoRefresh vía dos
 * canales:
 *
 *   1. sessionStorage[REFRESH_FLAG_KEY] = Date.now()
 *      — sobrevive el router.refresh() para que esta pill pueda saber que
 *      el SSR fue forzado por un evento Realtime y no por una navegación
 *      manual del usuario.
 *
 *   2. flagFlashAvailable() — wake-up en memoria
 *      — router.refresh() es soft (no remonta los client components), así
 *      que sin una notificación explícita useSyncExternalStore se queda con
 *      el snapshot cacheado. flagFlashAvailable() bumpea la version y
 *      dispara a los listeners para releer sessionStorage.
 *
 * El fade-in y fade-out los maneja CSS (clara-flash-fade) con
 * animation-fill-mode: forwards — sin setTimeout ni state local.
 */

import { useSyncExternalStore } from "react";
import { REFRESH_FLAG_KEY } from "./hero-auto-refresh";

/** Si el flag tiene más de 30s, lo descartamos — fue de otra sesión o de
 *  un refresh que ya nadie está mirando. Evita que el flash aparezca al
 *  volver a un tab inactivo días después. */
const FLAG_MAX_AGE_MS = 30_000;

// ─── Store en memoria compartido con HeroAutoRefresh ───
let version = 0;
let cached: boolean | null = null;
const listeners = new Set<() => void>();

/** Llamado por HeroAutoRefresh justo antes de router.refresh() para que
 *  esta pill releea sessionStorage y dispare la animación. */
export function flagFlashAvailable() {
  version++;
  cached = null;
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): boolean {
  if (cached !== null) return cached;
  try {
    const raw = sessionStorage.getItem(REFRESH_FLAG_KEY);
    if (!raw) {
      cached = false;
      return false;
    }
    const at = Number(raw);
    // Consumir el flag — una vez leído, no debe activarse de nuevo hasta
    // que HeroAutoRefresh llame a flagFlashAvailable() otra vez.
    sessionStorage.removeItem(REFRESH_FLAG_KEY);
    cached =
      Number.isFinite(at) && Date.now() - at <= FLAG_MAX_AGE_MS;
    return cached;
  } catch {
    cached = false;
    return false;
  }
}

const getServerSnapshot = (): boolean => false;

export function HeroRefreshFlash() {
  const visible = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  if (!visible) return null;

  // key={version} fuerza unmount+remount entre flashes consecutivos para
  // que la animación CSS arranque desde 0 cada vez (sin esto, el span ya
  // animado quedaría en su estado final y no se vería el nuevo flash).
  return (
    <span
      key={version}
      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] clara-flash-fade"
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        background: "color-mix(in oklab, var(--accent) 18%, transparent)",
        border:
          "1px solid color-mix(in oklab, var(--accent) 40%, transparent)",
        color: "var(--accent)",
        pointerEvents: "none",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: "var(--accent)",
          boxShadow: "0 0 8px var(--accent)",
        }}
      />
      Actualizado recién
    </span>
  );
}
