import type { Metadata } from "next";
import { FireHistoryDashboard } from "@/components/fire-history-dashboard";
import { StaggerReveal } from "@/components/stagger-reveal";

export const metadata: Metadata = {
  title: "Historial de Incendios",
  description:
    "Actividad historica de focos de calor en Argentina. Datos satelitales NASA FIRMS VIIRS.",
  openGraph: {
    title: "Historial de Incendios — CLARA",
    description: "Evolucion diaria de detecciones satelitales en todo el territorio argentino.",
  },
  twitter: {
    card: "summary",
    title: "Historial de Incendios — CLARA",
    description: "Evolucion diaria de detecciones satelitales en Argentina.",
  },
};

export default function HistorialPage() {
  return (
    <main className="relative z-10 flex-1">
      <div className="px-6 md:px-10 lg:px-16 py-16 max-w-6xl mx-auto">
        <StaggerReveal delay={0.1}>
          <div className="mb-10">
            <p className="font-mono text-xs text-accent uppercase tracking-[0.2em] mb-3">
              Historial
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-foreground/90 mb-2">
              Actividad de focos de calor
            </h1>
            <p className="text-sm text-muted max-w-lg">
              Evolucion diaria de detecciones satelitales en todo el territorio
              argentino. Fuente: NASA FIRMS VIIRS.
            </p>
          </div>
        </StaggerReveal>

        <StaggerReveal delay={0.3}>
          <FireHistoryDashboard />
        </StaggerReveal>
      </div>
    </main>
  );
}
