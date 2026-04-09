"use client";

import dynamic from "next/dynamic";

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

export function FireMapLoader() {
  return <FireMap />;
}
