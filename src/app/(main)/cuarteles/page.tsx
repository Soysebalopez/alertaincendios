import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  TelegramLogo,
  Broadcast,
  MapPinLine,
  Users,
  Fire,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/clara-ui";

export const metadata: Metadata = {
  title: "Bomberos voluntarios",
  description:
    "El canal operativo de AlertaForestal para cuarteles de bomberos voluntarios: alertas crudas con coordenadas, viento y FRP, sin interpretación, firmadas por cuartel.",
  alternates: { canonical: "/cuarteles" },
};

const TELEGRAM_BOT_URL = "https://t.me/alertaforestal_bot";

// Comparación civilian vs fireman — refleja el comportamiento real del bot
// (src/app/api/alerts/route.ts: formatFiremanAlert + filtro forestal).
const VECINO = [
  "Mensaje en lenguaje claro, con interpretación del bot",
  "Solo focos en zona forestal cercana (hasta 100 km)",
  "Encabezado “🔥 Posible foco a X km”",
];
const BOMBERO = [
  "Mensaje operativo crudo: FRP, confianza, viento, coordenadas, link a Maps",
  "Todos los focos detectados en tu zona, sin filtro forestal",
  "Encabezado “🚨 Foco a X km — coordinación”, firmado por tu cuartel",
];

const PASOS: { icon: React.ReactNode; title: string; body: React.ReactNode }[] = [
  {
    icon: <MapPinLine size={18} weight="duotone" />,
    title: "1 · Suscribite al bot",
    body: (
      <>
        Abrí{" "}
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline"
        >
          @alertaforestal_bot
        </a>{" "}
        y compartí tu ubicación (o usá <code>/ciudad</code>). Quedás como vecino
        hasta validar tu rol.
      </>
    ),
  },
  {
    icon: <Users size={18} weight="duotone" />,
    title: "2 · Pedí el código a tu cuartel",
    body: (
      <>
        Cada cuartel tiene un código de invitación. Pedíselo al jefe de cuartel —
        es el mismo para toda la dotación.
      </>
    ),
  },
  {
    icon: <Broadcast size={18} weight="duotone" />,
    title: "3 · Activá el modo bombero",
    body: (
      <>
        Mandale al bot <code>/soybombero TU-CODIGO</code>. Listo: pasás a recibir
        los mensajes operativos. Si dejás el cuartel, <code>/dejarcuartel</code>{" "}
        te devuelve a alertas de vecino sin perder tu suscripción.
      </>
    ),
  },
];

export default function CuartelesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="border-b border-border">
        <div className="max-w-[820px] mx-auto" style={{ padding: "80px 32px 56px" }}>
          <Pill tone="accent">
            <Fire size={10} weight="fill" /> Bomberos voluntarios
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
            El canal operativo para{" "}
            <span className="text-accent">tu cuartel</span>.
          </h1>
          <p
            className="text-muted"
            style={{ fontSize: 18, lineHeight: 1.55, maxWidth: "64ch" }}
          >
            AlertaForestal tiene un modo dedicado para bomberos: en vez del
            mensaje pensado para vecinos, recibís la detección cruda —
            coordenadas, viento y potencia del foco— para coordinar la respuesta
            apenas el satélite la ve.
          </p>
        </div>
      </section>

      {/* Comparación */}
      <section className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div className="max-w-[820px] mx-auto" style={{ padding: "56px 32px 64px" }}>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 24px",
            }}
          >
            Qué cambia en modo bombero
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {[
              { label: "Vecino", items: VECINO, accent: false },
              { label: "Bombero", items: BOMBERO, accent: true },
            ].map(({ label, items, accent }) => (
              <article
                key={label}
                style={{
                  padding: "24px 26px",
                  background: "var(--background)",
                  borderRadius: 14,
                  border: accent
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                }}
              >
                <div
                  className={accent ? "text-accent" : "text-muted"}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 14,
                  }}
                >
                  {label}
                </div>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    fontSize: 15,
                    lineHeight: 1.5,
                    color: "color-mix(in oklab, var(--foreground) 85%, transparent)",
                  }}
                >
                  {items.map((it) => (
                    <li key={it} className="flex gap-2">
                      <span className={accent ? "text-accent" : "text-muted"}>
                        ›
                      </span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo activarlo */}
      <section className="border-b border-border">
        <div className="max-w-[820px] mx-auto" style={{ padding: "56px 32px 64px" }}>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 24px",
            }}
          >
            Cómo activarlo
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {PASOS.map(({ icon, title, body }) => (
              <article
                key={title}
                style={{
                  padding: "22px 26px",
                  background: "var(--surface)",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
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
                  <h3
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "-0.015em",
                      margin: 0,
                    }}
                  >
                    {title}
                  </h3>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: "color-mix(in oklab, var(--foreground) 85%, transparent)",
                  }}
                >
                  {body}
                </div>
              </article>
            ))}
          </div>

          <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.6, marginTop: 24 }}>
            ¿Sos jefe de cuartel y tu cuartel todavía no está? Estamos sumando
            cuarteles de a uno en esta etapa. Escribinos por el bot y coordinamos
            el alta de tu cuartel.
          </p>
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
            Sumá a tu cuartel
          </h2>
          <p
            className="text-muted mx-auto"
            style={{ fontSize: 16, maxWidth: "48ch", margin: "0 auto 28px" }}
          >
            Suscribite al bot y validá tu rol con el código de tu cuartel.
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
