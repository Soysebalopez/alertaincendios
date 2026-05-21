"use client";

import dynamic from "next/dynamic";
import type { SatelliteTLE } from "@/lib/satellites";
import type { FirePoint } from "@/lib/firms";

const FireMap = dynamic(
  () => import("@/components/fire-map").then((m) => m.FireMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-surface">
        <span className="font-mono text-xs text-muted animate-pulse">
          Cargando mapa...
        </span>
      </div>
    ),
  }
);

export function FireMapLoader({
  tles = [],
  fires = [],
}: {
  tles?: SatelliteTLE[];
  fires?: FirePoint[];
}) {
  return <FireMap tles={tles} fires={fires} />;
}
