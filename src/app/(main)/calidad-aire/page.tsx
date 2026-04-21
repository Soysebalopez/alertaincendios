import type { Metadata } from "next";
import { AirDashboard } from "@/components/air-quality/air-dashboard";
import { Pill } from "@/components/clara-ui";
import { Drop } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Calidad del Aire",
  description:
    "Monitoreo de calidad del aire por provincia y ciudad en Argentina. Datos CAMS / Sentinel-5P via Open-Meteo.",
  openGraph: {
    title: "Calidad del Aire — CLARA",
    description:
      "NO₂, SO₂, O₃, PM2.5 y mas en las principales ciudades argentinas. Umbrales OMS.",
  },
  twitter: {
    card: "summary",
    title: "Calidad del Aire — CLARA",
    description:
      "Monitoreo de calidad del aire por provincia y ciudad en Argentina.",
  },
};

export default function CalidadAirePage() {
  return (
    <>
      <section
        className="clara-section-padded border-b border-border"
        style={{ padding: "60px 32px 40px" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <Pill>
            <Drop size={10} weight="duotone" /> Calidad del aire
          </Pill>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              margin: "16px 0 20px",
            }}
          >
            Monitoreo de contaminantes
            <br />
            por <span className="text-accent">provincia</span>.
          </h1>
          <p
            className="text-muted"
            style={{
              fontSize: 15,
              maxWidth: "60ch",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Medimos NO₂, SO₂, O₃, PM2.5, PM10 y CO en las ciudades principales
            de las 24 provincias argentinas. Los datos vienen del sistema
            Copernicus de la ESA, cruzados con viento en tiempo real de
            Open-Meteo.
          </p>
        </div>
      </section>

      <AirDashboard />
    </>
  );
}
