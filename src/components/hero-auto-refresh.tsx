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
  // baseline contra el que comparamos cuando llega el evento Realtime.
  // Se resetea cuando el SSR re-monta el componente con un conteo nuevo —
  // eso pasa después de cada router.refresh() exitoso, así no entramos
  // en un bucle de refresh.
  const baselineRef = useRef(initialHigh);
  const refreshingRef = useRef(false);

  useEffect(() => {
    baselineRef.current = initialHigh;
    refreshingRef.current = false;
  }, [initialHigh]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    console.log("[clara/realtime] mounting auto-refresh effect");
    const channel = supabase
      .channel("clara-fires-cache")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fires_cache" },
        async (payload) => {
          console.log("[clara/realtime] postgres_changes event", payload);
          if (refreshingRef.current) {
            console.log("[clara/realtime] ignoring — refresh in flight");
            return;
          }
          try {
            const res = await fetch("/api/fires", { cache: "no-store" });
            if (!res.ok) {
              console.warn("[clara/realtime] /api/fires not ok", res.status);
              return;
            }
            const data = await res.json();
            const fires = (data.fires ?? []) as FirePoint[];
            const high = countHigh(fires);
            console.log(
              "[clara/realtime] high=" + high + " baseline=" + baselineRef.current
            );
            if (high > baselineRef.current) {
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
          } catch (e) {
            console.warn("[clara/realtime] handler error", e);
          }
        }
      )
      .subscribe((status, err) => {
        console.log("[clara/realtime] subscribe status:", status, err);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
