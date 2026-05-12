"use client";

/**
 * Pill efímera "Actualizado recién" que aparece junto al timestamp del hero
 * cuando HeroAutoRefresh dispara un router.refresh() por un evento Realtime.
 *
 * Coordinación con HeroAutoRefresh vive en `@/lib/refresh-flag` para
 * romper el ciclo de imports entre los dos archivos. Ver el comentario
 * de cabecera de ese módulo para el detalle del flujo.
 *
 * El fade-in/fade-out es 100% CSS (clara-flash-fade con
 * animation-fill-mode: forwards). key={getFlashVersion()} fuerza
 * unmount+remount entre flashes consecutivos para que la animación
 * arranque de 0 cada vez.
 */

import { useSyncExternalStore } from "react";
import {
  subscribeFlash,
  getFlashSnapshot,
  getFlashServerSnapshot,
  getFlashVersion,
} from "@/lib/refresh-flag";

export function HeroRefreshFlash() {
  const visible = useSyncExternalStore(
    subscribeFlash,
    getFlashSnapshot,
    getFlashServerSnapshot
  );
  if (!visible) return null;

  return (
    <span
      key={getFlashVersion()}
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
