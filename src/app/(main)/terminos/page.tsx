import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_CONTACT_EMAIL, LegalList, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Las condiciones para usar AlertaForestal y su bot de Telegram, Clara.",
  alternates: { canonical: "/terminos" },
};

// WHI-929. ⚠️ Draft for Seba's review — see the open questions in the PR.
export default function TerminosPage() {
  return (
    <LegalPage
      kicker="Términos de uso"
      title="Términos de uso"
      intro={
        <p>
          Las reglas para usar el sitio alertaforestal.org y el bot de Telegram
          Clara (@alertaforestal_bot). Al usarlos, aceptás estos términos.
        </p>
      }
    >
      <LegalSection title="1. Quiénes somos">
        <p>
          AlertaForestal es un proyecto de <strong>Growing Bay</strong>, con base
          en Bahía Blanca, Argentina. Para cualquier consulta escribinos a{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-accent">{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué es el servicio">
        <p>
          Un servicio <strong>gratuito</strong> de información sobre incendios:
          un mapa con los focos de calor que detectan satélites públicos, datos
          de calidad del aire y clima, y alertas por Telegram cuando hay un foco,
          humo o tormenta eléctrica seca cerca de la ubicación que nos diste.
        </p>
      </LegalSection>

      <LegalSection title="3. No es un servicio de emergencias">
        <p>
          AlertaForestal informa: <strong>no reemplaza a bomberos, defensa civil
          ni a los organismos de manejo del fuego</strong>, y las decisiones
          operativas ante un incendio son siempre de ellos. Ante fuego o humo,
          llamá al 100, al 911 o al 103. Los límites de lo que ven los satélites
          están explicados en el{" "}
          <Link href="/aviso" className="text-accent">aviso importante</Link>,
          que forma parte de estos términos.
        </p>
      </LegalSection>

      <LegalSection title="4. Sin garantía">
        <p>
          El servicio se ofrece <strong>tal cual</strong> y según su
          disponibilidad. Hacemos nuestro mejor esfuerzo, pero no garantizamos
          que funcione sin interrupciones, que detecte todos los incendios, que
          las alertas lleguen a tiempo ni que cada dato sea exacto. Depende de
          fuentes externas (satélites, servicios meteorológicos, Telegram) que no
          controlamos.
        </p>
      </LegalSection>

      <LegalSection title="5. Responsabilidad">
        <p>
          En la medida que lo permita la ley argentina, Growing Bay no responde
          por daños derivados de usar el servicio o de no poder usarlo, de una
          alerta que no llegó, llegó tarde o resultó equivocada, ni de decisiones
          tomadas en base a esta información. Nada de esto limita los derechos
          que la ley te reconoce y que no se pueden renunciar.
        </p>
      </LegalSection>

      <LegalSection title="6. Uso correcto">
        <p>Te pedimos que no:</p>
        <LegalList>
          <li>uses el bot o el sitio para molestar a otras personas o para fines ilegales;</li>
          <li>intentes sobrecargar, vulnerar o acceder sin permiso a los sistemas;</li>
          <li>presentes las alertas como si fueran comunicaciones oficiales de un organismo público.</li>
        </LegalList>
        <p>Podemos dejar de enviarle alertas a quien use el servicio de forma abusiva.</p>
      </LegalSection>

      <LegalSection title="7. Fuentes de datos">
        <p>
          Los datos vienen de fuentes abiertas, cada una con su propia licencia:
          NASA FIRMS (satélites VIIRS), NOAA GOES-19 (focos y rayos),
          el Servicio Meteorológico Nacional (licencia CC BY 2.5 AR), Copernicus
          (Unión Europea) y Open-Meteo (licencia CC BY 4.0). Si reutilizás esos
          datos, respetá la licencia de cada fuente.
        </p>
      </LegalSection>

      <LegalSection title="8. Tus datos">
        <p>
          Qué datos guardamos y para qué está en la{" "}
          <Link href="/privacidad" className="text-accent">política de privacidad</Link>.
        </p>
      </LegalSection>

      <LegalSection title="9. Cambios y baja">
        <p>
          Podemos cambiar, pausar o dar de baja el servicio, y actualizar estos
          términos; la fecha de arriba indica la última versión. Podés
          dejar de usar el servicio cuando quieras escribiéndole{" "}
          <strong>/cancelar</strong> a Clara.
        </p>
      </LegalSection>

      <LegalSection title="10. Ley aplicable">
        <p>Estos términos se rigen por las leyes de la República Argentina.</p>
      </LegalSection>
    </LegalPage>
  );
}
