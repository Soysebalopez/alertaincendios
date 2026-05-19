"use client";

/**
 * Escucha cambios en fires_cache via Supabase Realtime (postgres_changes
 * UPDATE) y dispara router.refresh() apenas detecta un nuevo "incendio
 * destacado" — wildfire FIRMS confirmado con FRP ≥ 20 MW respecto al
 * baseline SSR.
 *
 * Reemplaza al polling cada 60s de la primera iteración. Un único
 * WebSocket por cliente reemplaza a 60 requests/hora contra /api/fires,
 * y la latencia upstream→cliente baja de hasta 60s a ~1s.
 *
 * Solo refresca al alza: si un destacado desaparece (cooled, salió de
 * 24h) no interrumpe al lector porque el hero sigue siendo informativo.
 *
 * Coordinación con HeroRefreshFlash: antes de cada router.refresh()
 * escribe un timestamp en sessionStorage. El flash lo lee al montar
 * para mostrar la pill "Actualizado recién" y lo borra después.
 *
 * Renderiza null — solo efecto.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { flagFlashAvailable, REFRESH_FLAG_KEY } from "@/lib/refresh-flag";

interface FirePoint {
  type?: number;
  frp: number;
  /** WHI-757: foco está dentro de una de las zonas forestales argentinas. */
  forestZone?: string;
}

// WHI-757: el contador del hero ahora refleja focos forestales activos
// (cualquier FRP), no solo los de alta intensidad. El threshold ≥ 20 dejaba
// "0 focos destacados" la mayor parte del año fuera de temporada alta.
function countForestActive(fires: FirePoint[]): number {
  let n = 0;
  for (const f of fires) {
    const isWild = (f.type ?? 0) === 0 || f.type === 1;
    if (isWild && f.forestZone) n++;
  }
  return n;
}

export function HeroAutoRefresh({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  // baseline contra el que comparamos cuando llega el evento Realtime.
  // Se resetea cuando el SSR re-monta el componente con un conteo nuevo —
  // eso pasa después de cada router.refresh() exitoso, así no entramos
  // en un bucle de refresh.
  const baselineRef = useRef(initialCount);
  const refreshingRef = useRef(false);

  useEffect(() => {
    baselineRef.current = initialCount;
    refreshingRef.current = false;
  }, [initialCount]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("clara-fires-cache")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "fires_cache" },
        async () => {
          if (refreshingRef.current) return;
          // El payload del evento contiene la row cruda, pero queremos los
          // counts ya pasados por el polígono ARG y por classifyFireType —
          // que es exactamente lo que devuelve /api/fires. Un fetch puntual
          // por UPDATE.
          try {
            const res = await fetch("/api/fires", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            const fires = (data.fires ?? []) as FirePoint[];
            const forestActive = countForestActive(fires);
            if (forestActive > baselineRef.current) {
              refreshingRef.current = true;
              try {
                sessionStorage.setItem(REFRESH_FLAG_KEY, Date.now().toString());
              } catch {
                // sessionStorage puede tirar en navegadores privados; el
                // refresh sigue funcionando aunque la pill no aparezca.
              }
              flagFlashAvailable();
              router.refresh();
            }
          } catch {
            // Network blip — Realtime nos avisará en el próximo UPDATE.
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
