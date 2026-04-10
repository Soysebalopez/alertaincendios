import type { Metadata } from "next";
import { MapLoader } from "@/components/map/map-loader";
import { Eye } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Mapa — CLARA",
  description:
    "Mapa interactivo de Argentina con focos de calor, calidad del aire y datos de viento en tiempo real.",
};

export default function MapaPage() {
  return (
    <main className="relative z-10 flex-1 border-t border-border">
      <MapLoader />
      <div className="absolute top-4 left-4 flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 z-[1000]">
        <Eye size={14} className="text-accent" />
        <span className="font-mono text-[11px] text-muted">
          NASA FIRMS + CAMS + Open-Meteo
        </span>
      </div>
    </main>
  );
}
