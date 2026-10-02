import type { Metadata } from "next";
import Link from "next/link";
import { LegalList, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Aviso importante",
  description:
    "AlertaForestal informa y anticipa: no reemplaza a bomberos, defensa civil ni a los organismos de manejo del fuego, que son quienes deciden qué hacer ante un incendio.",
  alternates: { canonical: "/aviso" },
};

// WHI-929 — the disclaimer the issue asks for: the final operational decision
// belongs to the competent authority, not to the platform.
export default function AvisoPage() {
  return (
    <LegalPage
      kicker="Aviso importante"
      title="AlertaForestal informa. No decide ni reemplaza a nadie."
      intro={
        <p>
          Leé esto antes de usar las alertas para decidir algo. Es corto y es lo
          más importante que tenemos para decirte.
        </p>
      }
    >
      <LegalSection title="Ante un incendio, llamá primero">
        <p>
          Si ves fuego o humo cerca, <strong>no esperes una alerta ni te fíes
          de que no haya llegado ninguna</strong>. Llamá a los servicios de
          emergencia:
        </p>
        <LegalList>
          <li><strong>100</strong> — Bomberos</li>
          <li><strong>911</strong> — Emergencias, donde esté disponible</li>
          <li><strong>103</strong> — Defensa Civil</li>
        </LegalList>
        <p>Y seguí siempre las indicaciones de las autoridades de tu zona.</p>
      </LegalSection>

      <LegalSection title="La decisión es del organismo competente">
        <p>
          AlertaForestal es una herramienta de información. Las decisiones
          operativas —evacuar, cortar una ruta, despachar una brigada, declarar
          una emergencia— <strong>son siempre de los organismos competentes</strong>:
          bomberos, defensa civil, los servicios provinciales de manejo del
          fuego y el Servicio Nacional de Manejo del Fuego. Ninguna alerta de
          esta plataforma es una orden ni una indicación oficial.
        </p>
      </LegalSection>

      <LegalSection title="Lo que los satélites pueden y no pueden ver">
        <p>Las alertas salen de satélites públicos y de modelos del clima. Eso tiene límites reales:</p>
        <LegalList>
          <li>
            <strong>Pueden llegar tarde.</strong> Un satélite tiene que pasar por
            arriba, procesar la imagen y publicarla. Entre que empieza un fuego y
            llega el aviso pueden pasar desde minutos hasta horas.
          </li>
          <li>
            <strong>Pueden no verlo.</strong> Las nubes, el humo denso o un fuego
            chico o bajo los árboles pueden hacer que un incendio real no se
            detecte.
          </li>
          <li>
            <strong>Pueden equivocarse.</strong> Los satélites miden calor, no
            ven llamas: una quema agrícola, un techo que refleja el sol o una
            instalación industrial pueden parecer un foco.
          </li>
          <li>
            <strong>La ubicación es aproximada.</strong> Cada detección tiene un
            margen de cientos de metros a varios kilómetros.
          </li>
          <li>
            <strong>Los rayos no se ven en detalle.</strong> El satélite detecta
            la descarga eléctrica, pero no distingue si el rayo tocó el suelo.
          </li>
          <li>
            <strong>El servicio puede interrumpirse.</strong> Depende de fuentes
            de datos, de Telegram y de servidores que pueden fallar.
          </li>
        </LegalList>
        <p>
          Por eso <strong>que no te llegue una alerta no significa que no haya
          un incendio</strong>.
        </p>
      </LegalSection>

      <LegalSection title="Es gratis y se ofrece tal cual">
        <p>
          AlertaForestal es un servicio gratuito, hecho con el mejor esfuerzo
          pero sin garantía de que funcione siempre ni de que cada alerta sea
          exacta. Las condiciones completas están en los{" "}
          <Link href="/terminos" className="text-accent">términos de uso</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
