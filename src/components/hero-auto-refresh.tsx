"use client";

/**
 * Polea /api/fires cada 60 segundos y dispara router.refresh() apenas
 * detecta un nuevo "incendio destacado" — wildfire FIRMS confirmado con
 * FRP ≥ 20 MW respecto al baseline SSR. Solo refresca al alza: si un
 * destacado desaparece (bajó la FRP, salió de la ventana de 24h) no
 * interrumpimos al usuario porque el hero sigue siendo informativo.
 *
 * Renderiza null — solo efecto. Embebido una vez en el layout del hero.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 60_000;
const HIGH_FRP_MW = 20;

interface FirePoint {
  type?: number;
  frp: number;
}

function countHigh(fires: FirePoint[]): number {
  let n = 0;
  for (const f of fires) {
    const isWild = (f.type ?? 0) === 0 || f.type === 1;
    if (isWild && f.frp >= HIGH_FRP_MW) n++;
  }
  return n;
}

export function HeroAutoRefresh({ initialHigh }: { initialHigh: number }) {
  const router = useRouter();
  // baseline contra el que comparamos cada polleo. Se resetea cuando el SSR
  // se vuelve a montar con un nuevo conteo — eso pasa después de cada
  // router.refresh() exitoso, así no quedamos refrescando en loop.
  const baselineRef = useRef(initialHigh);
  // Una vez que disparamos un refresh, esperamos a que el SSR re-monte el
  // componente con el nuevo baseline antes de volver a comparar. Si no,
  // poderiamos refrescar dos veces antes de que llegue la nueva data.
  const refreshingRef = useRef(false);

  useEffect(() => {
    baselineRef.current = initialHigh;
    refreshingRef.current = false;
  }, [initialHigh]);

  useEffect(() => {
    const tick = async () => {
      if (refreshingRef.current) return;
      try {
        const res = await fetch("/api/fires", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const fires = (data.fires ?? []) as FirePoint[];
        const high = countHigh(fires);
        if (high > baselineRef.current) {
          refreshingRef.current = true;
          router.refresh();
        }
      } catch {
        // Network blip — reintentamos en el siguiente tick. No spameamos
        // al usuario con errores: el hero sigue funcional con su data SSR.
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
