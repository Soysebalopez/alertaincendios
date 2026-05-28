import type { Metadata } from "next";
import { AirDashboard } from "@/components/air-quality/air-dashboard";
import { Pill } from "@/components/clara-ui";
import { Drop } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Calidad del aire por ciudad",
  description:
    "Cómo está el aire en las principales ciudades de Argentina ahora mismo. Actualizamos cada hora con datos de satélites de la ESA y la NASA.",
  alternates: { canonical: "/calidad-aire" },
  openGraph: {
    title: "Calidad del aire por ciudad — AlertaForestal",
    description:
      "Consultá la calidad del aire en tu ciudad. Bueno, moderado o malo — sin siglas técnicas.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Calidad del aire por ciudad — AlertaForestal",
    description:
      "Consultá la calidad del aire en tu ciudad. Bueno, moderado o malo — sin siglas técnicas.",
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
            ¿Cómo está el aire
            <br />
            en <span className="text-accent">tu ciudad</span>?
          </h1>
          <p
            className="text-muted"
            style={{
              fontSize: 16,
              maxWidth: "62ch",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Monitoreamos la calidad del aire en las ciudades principales de las
            24 provincias. Los datos vienen de satélites de la ESA y la NASA,
            actualizados cada hora.
          </p>
        </div>
      </section>

      <AirDashboard />
    </>
  );
}
