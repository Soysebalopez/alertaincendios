import type { Metadata } from "next";
import { FireHistoryDashboard } from "@/components/fire-history-dashboard";
import { Pill } from "@/components/clara-ui";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Historial de Incendios",
  description:
    "Actividad historica de focos de calor en Argentina. Datos satelitales NASA FIRMS VIIRS.",
  openGraph: {
    title: "Historial de Incendios — CLARA",
    description:
      "Evolucion diaria de detecciones satelitales en todo el territorio argentino.",
  },
  twitter: {
    card: "summary",
    title: "Historial de Incendios — CLARA",
    description: "Evolucion diaria de detecciones satelitales en Argentina.",
  },
};

export default function HistorialPage() {
  return (
    <>
      <section
        className="clara-section-padded border-b border-border"
        style={{ padding: "60px 32px 40px" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <Pill>
            <ClockCounterClockwise size={10} weight="duotone" /> Historial
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
            Evolución de focos
            <br />
            de calor en <span className="text-accent">Argentina</span>.
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
            Histórico diario agregado desde NASA FIRMS. Cada punto representa
            el total de detecciones VIIRS en el país en un día.
          </p>
        </div>
      </section>

      <section
        className="clara-section-padded"
        style={{ padding: "40px 32px 80px" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <FireHistoryDashboard />
        </div>
      </section>
    </>
  );
}
