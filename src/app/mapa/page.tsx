import type { Metadata } from "next";
import { MapLoader } from "@/components/map/map-loader";
import { MapInterpretation } from "@/components/map/map-interpretation";
import { Eye } from "@phosphor-icons/react/dist/ssr";
import { fetchTLEs } from "@/lib/satellites-server";

// WHI-754 — TLEs los necesita el cliente para propagar SGP4 y dibujar
// ground tracks. Los pasamos como prop server-side. ISR 5min porque los
// TLEs solo se refrescan diariamente (01:30 ART) — no hay razón para
// SSR fresco en cada visita. /api/alerts dispara revalidatePath('/mapa')
// cuando hay cambios de focos relevantes.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Mapa",
  description:
    "Mapa interactivo de Argentina con focos de calor, calidad del aire y datos de viento en tiempo real.",
  alternates: { canonical: "/mapa" },
  openGraph: {
    title: "Mapa — AlertaForestal",
    description: "Mapa interactivo con focos de calor, calidad del aire y viento en tiempo real.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mapa — AlertaForestal",
    description: "Mapa interactivo de monitoreo ambiental para Argentina.",
  },
};

export default async function MapaPage() {
  const tles = await fetchTLEs();
  return (
    <main className="relative z-10 border-t border-border">
      {/* Mapa con altura fija para dejar espacio scrolleable a la sección
          interpretativa de abajo. 75vh deja ver claramente el contenido
          siguiente al hacer un scroll mínimo. */}
      <div
        className="relative"
        style={{ height: "75vh", minHeight: 540 }}
      >
        <MapLoader tles={tles} />
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 z-[1000]">
          <Eye size={14} className="text-accent" />
          <span className="font-mono text-[11px] text-muted">
            NASA FIRMS + CAMS + Open-Meteo
          </span>
        </div>
      </div>
      <MapInterpretation />
    </main>
  );
}
