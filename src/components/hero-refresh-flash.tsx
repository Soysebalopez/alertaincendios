"use client";

/**
 * Pill efímera "Actualizado recién" que aparece junto al timestamp del hero
 * cuando HeroAutoRefresh dispara un router.refresh() por un evento Realtime.
 *
 * Diseñada para ser hydration-safe: el estado inicial es null tanto en SSR
 * como en el primer render del cliente, así no hay texto/nodo distinto
 * entre los dos pasos y React no tira #418. El consumo de sessionStorage
 * sucede en useEffect (post-mount), que es donde puede haber side effects.
 *
 * El fade-in/fade-out es 100% CSS (clara-flash-fade con
 * animation-fill-mode: forwards). key={flashKey} fuerza unmount+remount
 * entre flashes consecutivos para que la animación arranque de 0 cada vez.
 */

import { useEffect, useState } from "react";
import {
  REFRESH_FLAG_KEY,
  FLAG_MAX_AGE_MS,
  subscribeFlash,
} from "@/lib/refresh-flag";

function consumeFlag(): number | null {
  try {
    const raw = sessionStorage.getItem(REFRESH_FLAG_KEY);
    if (!raw) return null;
    const at = Number(raw);
    sessionStorage.removeItem(REFRESH_FLAG_KEY);
    if (!Number.isFinite(at) || Date.now() - at > FLAG_MAX_AGE_MS) return null;
    return at;
  } catch {
    return null;
  }
}

export function HeroRefreshFlash() {
  // null durante SSR y durante el primer render del client (hidratación).
  // Tras montar, useEffect consume el flag si existe y lo escribe acá.
  // Cada flash subsecuente actualiza con un key nuevo para re-arrancar
  // la animación CSS.
  const [flashKey, setFlashKey] = useState<number | null>(null);

  useEffect(() => {
    const initial = consumeFlag();
    if (initial !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consumo one-shot de sessionStorage al montar; no hay riesgo de loop
      setFlashKey(initial);
    }
    return subscribeFlash(() => {
      const next = consumeFlag();
      if (next !== null) setFlashKey(next);
    });
  }, []);

  if (flashKey === null) return null;

  return (
    <span
      key={flashKey}
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
