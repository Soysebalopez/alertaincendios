import type { Metadata } from "next";
import { AirDashboard } from "@/components/air-quality/air-dashboard";
import { StaggerReveal } from "@/components/stagger-reveal";

export const metadata: Metadata = {
  title: "Calidad del Aire — CLARA",
  description:
    "Monitoreo de calidad del aire por provincia y ciudad en Argentina. Datos CAMS / Sentinel-5P via Open-Meteo.",
};

export default function CalidadAirePage() {
  return (
    <main className="relative z-10 flex-1">
      <div className="px-6 md:px-10 lg:px-16 py-16 max-w-6xl mx-auto">
        <StaggerReveal delay={0.1}>
          <div className="mb-10">
            <p className="font-mono text-xs text-accent uppercase tracking-[0.2em] mb-3">
              Calidad del aire
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-foreground/90 mb-2">
              Monitoreo por provincia y ciudad
            </h1>
            <p className="text-sm text-muted max-w-lg">
              Niveles de NO₂, SO₂, O₃, PM2.5, PM10 y CO en las principales
              ciudades argentinas. Umbrales segun guias de la OMS.
            </p>
          </div>
        </StaggerReveal>

        <StaggerReveal delay={0.3}>
          <AirDashboard />
        </StaggerReveal>
      </div>
    </main>
  );
}
