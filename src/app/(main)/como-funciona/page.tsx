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

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Explicación simple de cómo CLARA detecta incendios forestales en Argentina y te avisa por Telegram.",
};

const TELEGRAM_BOT_URL = "https://t.me/AlertasClaraBot";

// WHI-590 — explanations for non-technical readers.
// Each FAQ has a question and 1-2 short paragraphs in plain language.
// No jargon, no acronyms unexplained, no scary words.
const FAQS: { q: string; body: React.ReactNode; icon: React.ReactNode }[] = [
  {
    icon: <GlobeHemisphereWest size={18} weight="duotone" />,
    q: "¿Qué es CLARA?",
    body: (
      <>
        <p>
          Un bot de Telegram que <strong>te avisa</strong> cuando hay un foco
          de incendio cerca tuyo en Argentina. Gratis, sin registro, sin
          publicidad.
        </p>
        <p>
          Lo hacemos para que los vecinos de zonas rurales no se enteren de los
          incendios cuando ven el humo desde la ventana, sino antes.
        </p>
      </>
    ),
  },
  {
    icon: <Wind size={18} weight="duotone" />,
    q: "¿Cómo detecta los incendios?",
    body: (
      <>
        <p>
          Usamos <strong>dos satélites</strong> que sobrevuelan Argentina todo
          el día y miden la temperatura del suelo:
        </p>
        <ul style={{ paddingLeft: 18, marginTop: 6, lineHeight: 1.7 }}>
          <li>
            <strong>GOES-19</strong> (de la NOAA, Estados Unidos): mira
            Argentina cada 10 minutos. Detecta rápido, pero con menos precisión.
          </li>
          <li>
            <strong>FIRMS</strong> (de la NASA): pasa cada 3-6 horas pero ve
            mejor. Confirma si el foco es real.
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
            (los rayos son la causa #1 natural de incendios forestales).
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
    q: "¿Qué es una alerta «preliminar» y una «confirmada»?",
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
    q: "¿Es gratis? ¿Cómo se mantiene el sistema?",
    body: (
      <>
        <p>
          Es <strong>gratis y siempre va a serlo</strong>. CLARA es un proyecto
          independiente, sin publicidad, sin venta de datos.
        </p>
        <p>
          Los datos satelitales son públicos (NASA y NOAA los regalan). La
          infraestructura cuesta poco porque corre en planes gratuitos de
          Vercel y Supabase. Lo mantenemos por convicción, no por negocio.
        </p>
      </>
    ),
  },
  {
    icon: <Shield size={18} weight="duotone" />,
    q: "¿Qué hacen con mi ubicación?",
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
    body: (
      <>
        <p>
          Llamá al <strong>100</strong> (Bomberos) o al <strong>911</strong> de
          tu provincia. CLARA <em>avisa</em> pero no <em>responde</em>. La
          respuesta operativa la hacen los bomberos locales y Defensa Civil.
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
    body: (
      <>
        <p>
          Los satélites detectan <strong>calor anómalo</strong>, no fuego
          directo. Cosas como una chimenea industrial, el sol reflejado en un
          techo metálico, o una zona agrícola en quema controlada pueden
          activar una alerta sin que haya un incendio peligroso.
        </p>
        <p>
          Tenemos filtros para descartar la mayoría de esos casos (excluimos
          zonas urbanas, refinerías de Vaca Muerta, etc.), pero ningún sistema
          es 100% preciso. Por eso siempre validá antes de actuar fuerte.
        </p>
      </>
    ),
  },
];

export default function ComoFuncionaPage() {
  return (
    <main>
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
            CLARA en simple, sin{" "}
            <span className="text-accent">jerga técnica</span>.
          </h1>
          <p
            className="text-muted"
            style={{ fontSize: 18, lineHeight: 1.55, maxWidth: "64ch" }}
          >
            Esta página es para entender qué hacemos, cómo, y por qué confiar.
            Si después te animás, andá al bot.
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
            ¿Listo para suscribirte?
          </h2>
          <p
            className="text-muted mx-auto"
            style={{ fontSize: 16, maxWidth: "48ch", margin: "0 auto 28px" }}
          >
            Toma 30 segundos. Compartís tu ubicación y ya estás cubierto.
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
            <TelegramLogo size={18} weight="fill" /> Abrir @AlertasClaraBot{" "}
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
