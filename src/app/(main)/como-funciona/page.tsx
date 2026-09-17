import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  TelegramLogo,
  GlobeHemisphereWest,
  Wind,
  Bell,
  Shield,
  Lightning,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/clara-ui";
import { FaqJsonLd } from "@/components/jsonld";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Explicación simple de cómo AlertaForestal detecta incendios y te avisa por Telegram antes de que llegue el humo.",
  alternates: { canonical: "/como-funciona" },
};

const TELEGRAM_BOT_URL = "https://t.me/alertaforestal_bot";

// WHI-590 — explanations for non-technical readers.
// Each FAQ has a question and 1-2 short paragraphs in plain language.
// No jargon, no acronyms unexplained, no scary words.
//
// WHI-919 — `plain` es la MISMA respuesta en texto corrido, y existe sólo para
// el bloque `FAQPage` de datos estructurados. `body` es React —listas, negritas,
// enlaces—, y de un árbol de React no se saca texto plano en el servidor sin
// renderizarlo; ésa es la única razón por la que hay dos campos y no uno.
//
// 🔴 La regla, entonces: al cambiar un `body`, cambiar su `plain`. Si dicen
// cosas distintas, la página muestra una respuesta y el buscador lee otra —y
// nadie se entera, porque las dos «funcionan». Hay un test que exige que cada
// pregunta tenga su `plain` y que no sea un resumen de dos palabras.
const FAQS: {
  q: string;
  body: React.ReactNode;
  plain: string;
  icon: React.ReactNode;
}[] = [
  {
    icon: <GlobeHemisphereWest size={18} weight="duotone" />,
    q: "¿Qué es AlertaForestal?",
    plain:
      "Un servicio gratuito de alertas tempranas de incendios forestales en Argentina. Los mensajes llegan por Telegram a través de Clara, el bot del proyecto. El objetivo es que los vecinos de zonas rurales y forestales reciban el aviso antes de que el humo o el fuego llegue a su zona.",
    body: (
      <>
        <p>
          Un servicio gratuito de alertas tempranas de incendios forestales en
          Argentina. Los mensajes te llegan por Telegram a través de{" "}
          <strong>Clara</strong>, nuestro bot.
        </p>
        <p>
          El objetivo es que los vecinos de zonas rurales y forestales reciban
          una alerta temprana, antes de que el humo o el fuego llegue a su zona.
        </p>
      </>
    ),
  },
  {
    icon: <Wind size={18} weight="duotone" />,
    q: "¿Cómo detecta los incendios?",
    plain:
      "Con dos satélites que miden la temperatura del suelo. GOES-19 (NOAA, Estados Unidos) vigila Argentina cada 10 minutos: detecta rápido, con menos precisión. NASA FIRMS pasa con menos frecuencia pero con mayor resolución, y confirma si el foco es real. Cuando un satélite ve un punto más caliente que el resto del paisaje lo marca como posible incendio, y ese dato se cruza con el viento para saber si puede afectarte.",
    body: (
      <>
        <p>
          Usamos <strong>dos satélites</strong> que sobrevuelan Argentina todo
          el día y miden la temperatura del suelo:
        </p>
        <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.7 }}>
          <li>
            <strong>Satélite GOES-19</strong> (NOAA, Estados Unidos): vigila
            Argentina cada 10 minutos. Detecta rápido, aunque a veces con
            menos precisión.
          </li>
          <li>
            <strong>Satélite NASA FIRMS</strong>: pasa con menos frecuencia
            pero con mayor resolución. Confirma si el foco es real.
          </li>
        </ul>
        <p>
          Cuando un satélite ve un punto más caliente que el resto del paisaje,
          lo marca como un posible incendio. Después cruzamos esos datos con el
          viento para saber si te puede afectar.
        </p>
      </>
    ),
  },
  {
    icon: <Bell size={18} weight="duotone" />,
    q: "¿Cuándo me llega una alerta?",
    plain:
      "Sólo cuando hay algo sobre lo que se pueda actuar: si se detecta un foco a menos de 100 km de tu ubicación, si el viento puede traer humo hacia tu casa (con el tiempo estimado de llegada), o si hay tormenta eléctrica sin lluvia cerca, porque los rayos sobre campo seco son la principal causa natural de incendios en Argentina. Si no pasa nada, no llega ningún mensaje: en otoño e invierno podés no recibir nada por semanas.",
    body: (
      <>
        <p>Solo cuando hay algo que vos podés actuar:</p>
        <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.7 }}>
          <li>
            Si se detecta un foco <strong>a menos de 100 km</strong> de tu
            ubicación.
          </li>
          <li>
            Si el viento puede traer humo hacia tu casa, te avisamos con el
            tiempo estimado de llegada.
          </li>
          <li>
            Si hay <strong>tormenta eléctrica sin lluvia</strong> cerca tuyo
            (los rayos sobre campo seco son la principal causa natural de
            incendios en Argentina).
          </li>
        </ul>
        <p>
          Si no pasa nada, no te molestamos. En invierno y otoño podés no
          recibir nada por semanas. En primavera-verano (octubre a marzo) hay
          mucha más actividad.
        </p>
      </>
    ),
  },
  {
    icon: <Lightning size={18} weight="duotone" />,
    q: "¿Qué diferencia hay entre una alerta preliminar y una confirmada?",
    plain:
      "Una alerta preliminar la detectó GOES-19 hace pocos minutos: puede ser un foco real o ruido, como un reflejo del sol o una chimenea industrial. Una alerta confirmada es la que además ve NASA FIRMS, con más resolución. La preliminar se manda para ganar tiempo, pero conviene validar visualmente antes de tomar acciones grandes como llamar a bomberos o mover ganado. Si resulta falsa alarma, se avisa.",
    body: (
      <>
        <p>Es cómo nombramos las alertas según qué tan seguros estamos:</p>
        <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.7 }}>
          <li>
            <strong>⚠️ Preliminar</strong>: la detectó GOES-19 hace pocos
            minutos. Es <em>posible</em> que sea un foco real, pero puede ser
            ruido (un reflejo de sol, una chimenea industrial, etc).
          </li>
          <li>
            <strong>✅ Confirmada</strong>: NASA FIRMS también la ve, y con más
            resolución. Acá ya estamos seguros.
          </li>
        </ul>
        <p>
          Te mandamos la preliminar para ganar tiempo, pero te pedimos que
          valides visualmente antes de tomar acciones grandes (llamar bomberos,
          mover ganado, etc.). Si fue falsa alarma, te avisamos.
        </p>
      </>
    ),
  },
  {
    icon: <Shield size={18} weight="duotone" />,
    q: "¿Es gratis?",
    plain:
      "Sí. AlertaForestal es un proyecto independiente, sin publicidad ni venta de datos. La suscripción y las alertas son gratuitas para cualquier vecino que las necesite.",
    body: (
      <>
        <p>
          Sí. AlertaForestal es un proyecto independiente, sin publicidad ni
          venta de datos. La suscripción y las alertas son gratuitas para
          cualquier vecino que las necesite.
        </p>
      </>
    ),
  },
  {
    icon: <Shield size={18} weight="duotone" />,
    q: "¿Qué hacen con mi ubicación?",
    plain:
      "Se guarda únicamente para calcular qué tan lejos están los focos, y sólo la usa el servidor para mandar las alertas. Se borra con el comando /cancelar en el bot y no queda rastro. No se comparte, no se vende y no se usa para publicidad.",
    body: (
      <>
        <p>
          Solo la guardamos para calcular qué tan lejos están los focos. Nadie
          la ve excepto el servidor, y solo la usamos para mandarte las
          alertas. Si la querés borrar, <code>/cancelar</code> en el bot y
          listo, no queda rastro.
        </p>
        <p>
          No la compartimos con nadie, no la vendemos, no la usamos para
          publicidad.
        </p>
      </>
    ),
  },
  {
    icon: <GlobeHemisphereWest size={18} weight="duotone" />,
    q: "¿Qué hago si veo un incendio real?",
    plain:
      "Llamá al 100 (bomberos) o al 911 de tu provincia. La respuesta operativa al incendio la hacen los bomberos locales y Defensa Civil. También podés reportarlo en Satellites On Fire, que tiene un sistema más detallado para profesionales.",
    body: (
      <>
        <p>
          Llamá al <strong>100</strong> (Bomberos) o al <strong>911</strong> de
          tu provincia. La respuesta operativa al incendio la hacen los
          bomberos locales y Defensa Civil.
        </p>
        <p>
          También podés reportar en{" "}
          <a
            href="https://www.satellitesonfire.com.ar/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Satellites On Fire
          </a>{" "}
          que tiene un sistema más detallado para profesionales.
        </p>
      </>
    ),
  },
  {
    icon: <Wind size={18} weight="duotone" />,
    q: "¿Por qué a veces se equivoca?",
    plain:
      "Los satélites miden temperatura, no ven fuego directamente. Una chimenea industrial, el sol reflejado en un techo metálico o una zona agrícola en quema controlada pueden activar una alerta sin que haya un incendio peligroso. Hay filtros que descartan la mayoría de esos casos —se excluyen zonas urbanas, refinerías de Vaca Muerta y otras—, pero ningún sistema es 100% preciso, así que conviene validar la alerta antes de tomar decisiones operativas.",
    body: (
      <>
        <p>
          Los satélites <strong>miden temperatura</strong>, no ven fuego
          directamente. Cosas como una chimenea industrial, el sol reflejado
          en un techo metálico, o una zona agrícola en quema controlada
          pueden activar una alerta sin que haya un incendio peligroso.
        </p>
        <p>
          Tenemos filtros para descartar la mayoría de esos casos (excluimos
          zonas urbanas, refinerías de Vaca Muerta, etc.), pero ningún sistema
          es 100% preciso. Por eso siempre conviene validar la alerta antes de
          tomar decisiones operativas.
        </p>
      </>
    ),
  },
];

export default function ComoFuncionaPage() {
  return (
    <main>
      {/* WHI-919: las mismas preguntas de abajo, en datos estructurados. Salen
          del mismo array que la pantalla, así que no pueden desalinearse. */}
      <FaqJsonLd items={FAQS} />
      {/* Hero */}
      <section className="border-b border-border">
        <div className="max-w-[820px] mx-auto" style={{ padding: "80px 32px 56px" }}>
          <Pill>
            <GlobeHemisphereWest size={10} /> Cómo funciona
          </Pill>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(36px, 5.5vw, 56px)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              margin: "20px 0 18px",
            }}
          >
            Cómo funciona{" "}
            <span className="text-accent">AlertaForestal</span>.
          </h1>
          <p
            className="text-muted"
            style={{ fontSize: 18, lineHeight: 1.55, maxWidth: "64ch" }}
          >
            Una explicación simple de qué hacemos, cómo detectamos los focos
            forestales y cuándo recibís una alerta del bot Clara.
          </p>
        </div>
      </section>

      {/* FAQs */}
      <section className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div className="max-w-[820px] mx-auto" style={{ padding: "56px 32px 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {FAQS.map(({ q, body, icon }) => (
              <article
                key={q}
                style={{
                  padding: "24px 28px",
                  background: "var(--background)",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className="grid place-items-center text-accent"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--accent-soft)",
                    }}
                  >
                    {icon}
                  </span>
                  <h2
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 22,
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      margin: 0,
                    }}
                  >
                    {q}
                  </h2>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    lineHeight: 1.65,
                    color: "color-mix(in oklab, var(--foreground) 85%, transparent)",
                  }}
                >
                  {body}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-b border-border relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, var(--accent-soft), transparent 60%)",
          }}
        />
        <div
          className="relative mx-auto text-center"
          style={{ maxWidth: 640, padding: "72px 32px" }}
        >
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              margin: "0 0 14px",
            }}
          >
            ¿Querés recibir alertas?
          </h2>
          <p
            className="text-muted mx-auto"
            style={{ fontSize: 16, maxWidth: "48ch", margin: "0 auto 28px" }}
          >
            Son 30 segundos. Compartís tu ubicación y ya estás cubierto.
          </p>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 text-white font-semibold transition-transform active:scale-[0.98]"
            style={{
              padding: "16px 26px",
              borderRadius: 14,
              background: "var(--accent)",
              fontSize: 16,
              textDecoration: "none",
              boxShadow: "0 20px 40px -16px var(--accent)",
            }}
          >
            <TelegramLogo size={18} weight="fill" /> Abrir @alertaforestal_bot{" "}
            <ArrowRight size={16} />
          </a>
          <div className="mt-5">
            <Link
              href="/"
              className="text-muted text-[13px] hover:text-foreground transition-colors"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
