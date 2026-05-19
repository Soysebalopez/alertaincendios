"use client";

import dynamic from "next/dynamic";
import type { SatelliteTLE } from "@/lib/satellites";

const ArgentinaMap = dynamic(
  () =>
    import("./argentina-map").then((mod) => mod.ArgentinaMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <span className="font-mono text-xs text-muted animate-pulse">
          Cargando mapa...
        </span>
      </div>
    ),
  },
);

export function MapLoader({ tles = [] }: { tles?: SatelliteTLE[] }) {
  return <ArgentinaMap tles={tles} />;
}
