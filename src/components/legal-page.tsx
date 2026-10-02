import Link from "next/link";
import { Pill } from "@/components/clara-ui";

/**
 * WHI-929 — the three legal pages (términos, privacidad, aviso) share this
 * frame so they read as one set. Plain language on purpose: the person who
 * reads them is a neighbour who shared their location with a Telegram bot, not
 * a lawyer.
 */
export const LEGAL_UPDATED_AT = "2 de octubre de 2026";
export const LEGAL_CONTACT_EMAIL = "sebastian@growingbay.com";

export const LEGAL_LINKS = [
  { href: "/aviso", label: "Aviso importante" },
  { href: "/terminos", label: "Términos de uso" },
  { href: "/privacidad", label: "Privacidad" },
] as const;

export function LegalPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main>
      <section className="border-b border-border">
        <div className="max-w-[820px] mx-auto" style={{ padding: "80px 32px 40px" }}>
          <Pill>{kicker}</Pill>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              margin: "20px 0 18px",
            }}
          >
            {title}
          </h1>
          <div className="text-muted" style={{ fontSize: 17, lineHeight: 1.6, maxWidth: "64ch" }}>
            {intro}
          </div>
          <p className="text-muted font-mono" style={{ fontSize: 11, marginTop: 20, letterSpacing: "0.06em" }}>
            ÚLTIMA ACTUALIZACIÓN: {LEGAL_UPDATED_AT.toUpperCase()}
          </p>
        </div>
      </section>

      <section style={{ background: "var(--surface)" }} className="border-b border-border">
        <div
          className="clara-legal max-w-[820px] mx-auto"
          style={{
            padding: "48px 32px 72px",
            fontSize: 15,
            lineHeight: 1.7,
            color: "color-mix(in oklab, var(--foreground) 88%, transparent)",
          }}
        >
          {children}

          <nav
            aria-label="Textos legales"
            className="flex flex-wrap gap-x-5 gap-y-2"
            style={{ marginTop: 48, paddingTop: 20, borderTop: "1px solid var(--border)", fontSize: 13 }}
          >
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-muted hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ))}
            <Link href="/" className="text-muted hover:text-foreground transition-colors">
              ← Volver al inicio
            </Link>
          </nav>
        </div>
      </section>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 10px",
          color: "var(--foreground)",
        }}
      >
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul style={{ listStyle: "disc", paddingLeft: 20, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>{children}</ul>;
}
