import type { Metadata } from "next";
import { LEGAL_CONTACT_EMAIL, LegalList, LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos guarda AlertaForestal cuando te suscribís al bot Clara, para qué los usa, con quién se comparten y cómo pedir que se borren.",
  alternates: { canonical: "/privacidad" },
};

// WHI-929. 🔴 Every sentence here was checked against what the code and the
// database actually do on 2026-10-02 (tables `subscribers`, `subscriptions`,
// `feedback`, `bot_commands_log` and the `*_alerted` logs). If the bot starts
// storing something new — or /cancelar starts deleting more — this page has to
// change in the same PR. A privacy policy that promises more than the system
// does is worse than none.
export default function PrivacidadPage() {
  const mail = (
    <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-accent">
      {LEGAL_CONTACT_EMAIL}
    </a>
  );
  return (
    <LegalPage
      kicker="Privacidad"
      title="Política de privacidad"
      intro={
        <p>
          Para avisarte de un incendio cerca necesitamos saber dónde estás.
          Acá explicamos qué guardamos, para qué, con quién se comparte y cómo
          pedir que lo borremos.
        </p>
      }
    >
      <LegalSection title="Quién es responsable">
        <p>
          Growing Bay, con base en Bahía Blanca, Argentina, es responsable de
          estos datos. Contacto: {mail}.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos guardamos">
        <p>Cuando te suscribís al bot Clara en Telegram:</p>
        <LegalList>
          <li>
            <strong>Tu identificador de Telegram</strong>: un número que Telegram
            le asigna a cada chat. No vemos tu teléfono. Telegram nos muestra tu
            nombre para saludarte, pero no lo guardamos.
          </li>
          <li>
            <strong>La ubicación que compartís</strong> (o la ciudad que
            escribís), con la ciudad y la provincia que le corresponden.
          </li>
          <li>
            <strong>Tus preferencias</strong>: qué tipos de alerta tenés
            activados (rayos, campo, prevención).
          </li>
          <li>
            <strong>Cómo llegaste al bot</strong>, si entraste por un enlace con
            una etiqueta (por ejemplo, desde la página de tu ciudad).
          </li>
          <li>
            <strong>Registro de uso</strong>: qué comandos usaste y cuándo (con
            lo que escribiste después del comando, por ejemplo el nombre de una
            ciudad), y qué alertas te enviamos.
          </li>
          <li>
            <strong>Tus respuestas a «¿te sirvió esta alerta?»</strong>, junto con
            la distancia al foco y la ubicación de tu suscripción en ese momento.
          </li>
        </LegalList>
        <p>
          En el sitio web no hace falta registrarse ni usamos cookies para
          seguirte. Medimos visitas con Vercel Web Analytics, que cuenta páginas
          vistas de forma agregada y sin cookies.
        </p>
      </LegalSection>

      <LegalSection title="Para qué los usamos">
        <LegalList>
          <li>Para mandarte las alertas que corresponden a tu ubicación. Es el motivo principal.</li>
          <li>Para no repetirte el mismo aviso.</li>
          <li>Para medir si las alertas son útiles y mejorarlas.</li>
          <li>Para saber cuánta gente usa el servicio y desde dónde (por ciudad y provincia).</li>
        </LegalList>
        <p>
          <strong>No vendemos tus datos, no los usamos para publicidad y no te
          mandamos mensajes que no sean del servicio.</strong>
        </p>
      </LegalSection>

      <LegalSection title="Con quién se comparten">
        <p>Sólo con los servicios que necesitamos para que AlertaForestal funcione:</p>
        <LegalList>
          <li><strong>Telegram</strong>, por donde llegan los mensajes.</li>
          <li><strong>Supabase</strong>, donde está la base de datos (servidores en San Pablo, Brasil).</li>
          <li><strong>Vercel</strong>, donde funciona el sitio y el bot.</li>
          <li>
            <strong>Groq</strong>, un servicio de inteligencia artificial que
            redacta algunos resúmenes de los focos. Recibe el nombre de la ciudad
            y los datos de los focos; no recibe tu identificador ni tu ubicación
            exacta.
          </li>
        </LegalList>
        <p>
          Algunos de estos servicios guardan datos fuera de Argentina. Cuando
          alguien se suscribe, el equipo de Growing Bay recibe un aviso interno
          con la ciudad y la provincia. No compartimos tus datos con organismos
          públicos ni con nadie más, salvo que una ley o un juez lo exijan.
        </p>
      </LegalSection>

      <LegalSection title="Cuánto tiempo los guardamos">
        <p>
          Mientras estés suscripto. Cuando le escribís <strong>/cancelar</strong>{" "}
          a Clara, borramos tu suscripción: tu ubicación, tu ciudad y tus
          preferencias, y dejás de recibir alertas.
        </p>
        <p>
          El registro de uso y tus respuestas a las alertas quedan guardados
          para las estadísticas del servicio. Si querés que borremos{" "}
          <strong>todo</strong>, escribinos a {mail} desde cualquier medio
          indicando que querés la baja completa, y te pedimos lo justo para
          encontrar tu chat.
        </p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Por la Ley 25.326 de Protección de Datos Personales podés pedirnos
          saber qué datos tenemos tuyos, corregirlos o que los borremos.
          Escribinos a {mail}. El acceso es gratuito si lo pedís con intervalos
          de al menos seis meses, salvo que tengas un interés legítimo para
          hacerlo antes.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública, en su carácter de
          órgano de control de la Ley 25.326, tiene la atribución de atender las
          denuncias y reclamos que interpongan quienes resulten afectados en sus
          derechos por incumplimiento de las normas vigentes en materia de
          protección de datos personales.
        </p>
      </LegalSection>

      <LegalSection title="Seguridad">
        <p>
          Los datos de los suscriptores sólo se leen desde el servidor del
          servicio; la base tiene reglas que impiden leerlos desde afuera. Ningún sistema es invulnerable,
          pero nos tomamos en serio protegerla.
        </p>
      </LegalSection>

      <LegalSection title="Menores">
        <p>
          El servicio no está pensado para menores de 13 años.
        </p>
      </LegalSection>

      <LegalSection title="Cambios">
        <p>
          Si cambia lo que hacemos con tus datos, actualizamos esta página y la
          fecha de arriba.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
