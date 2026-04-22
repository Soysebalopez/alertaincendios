import {
  MapPin,
  Wind,
  GlobeHemisphereWest,
  ArrowRight,
  TelegramLogo,
  Bell,
  Shield,
  ArrowUpRight,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { FireCounter } from "@/components/fire-counter";
import { StaggerReveal } from "@/components/stagger-reveal";
import { FireMapLoader } from "@/components/fire-map-loader";
import { LiveCityGrid } from "@/components/live-city-grid";
import { Beacon, Pill, DataSourceLogo } from "@/components/clara-ui";

export const revalidate = 900; // 15 min — matches FIRMS sync cadence

const TELEGRAM_BOT_URL = "https://t.me/AlertaIncendiosBot";

async function getFireCount(): Promise<number> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return 0;
    const sb = createClient(url, key);
    const { data } = await sb
      .from("fires_cache")
      .select("count")
      .eq("id", 1)
      .single();
    return data?.count ?? 0;
  } catch {
    return 0;
  }
}

const DATA_SOURCES = [
  {
    name: "NASA FIRMS",
    sub: "VIIRS · Focos de calor 375m",
    org: "NASA",
    color: "#4b8bd4",
    icon: "nasa",
  },
  {
    name: "Copernicus CAMS",
    sub: "Atmospheric Monitoring Service",
    org: "ESA",
    color: "#7fb3c7",
    icon: "esa",
  },
  {
    name: "Sentinel-5P",
    sub: "NO₂ / SO₂ / O₃ troposférico",
    org: "ESA Copernicus",
    color: "#6aa8d4",
    icon: "sentinel",
  },
  {
    name: "Open-Meteo",
    sub: "Viento · Temperatura · Humedad",
    org: "Open-Source",
    color: "#ff6b35",
    icon: "openmeteo",
  },
  {
    name: "Telegram Bot API",
    sub: "Distribución de alertas",
    org: "Telegram",
    color: "#5eb1e8",
    icon: "telegram",
  },
] as const;

const STEPS = [
  {
    n: "01",
    icon: <MapPin size={16} weight="duotone" />,
    title: "Compartí tu ubicación",
    body: "Abrí el bot de Telegram y mandá tu GPS o escribí tu ciudad. Calculamos la distancia a cada foco detectado.",
  },
  {
    n: "02",
    icon: <GlobeHemisphereWest size={16} weight="duotone" />,
    title: "Escaneamos con satélites",
    body: "Cada 15 minutos consultamos NASA FIRMS. VIIRS detecta anomalías térmicas con resolución de 375 metros.",
  },
  {
    n: "03",
    icon: <Wind size={16} weight="duotone" />,
    title: "Modelo de dispersión",
    body: "Cruzamos el foco con datos de viento en tiempo real. Sabemos si el humo va hacia tu zona y en cuánto tiempo.",
  },
  {
    n: "04",
    icon: <Bell size={16} weight="duotone" />,
    title: "Te avisamos",
    body: "Si un foco está a menos de 100 km y el viento empuja el humo hacia vos, alerta instantánea con distancia, dirección y ETA.",
  },
] as const;

export default async function Home() {
  const fireCount = await getFireCount();
  const timestamp = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const metrics = [
    { label: "Provincias monitoreadas", value: "24", sub: "cobertura nacional" },
    { label: "Ciudades activas", value: "78", sub: "sensores OMS" },
    {
      label: "Focos últimas 24h",
      value: fireCount > 0 ? fireCount.toLocaleString("es-AR") : "—",
      sub: "VIIRS 375m",
      tone: "accent" as const,
    },
    { label: "Cadencia", value: "15 min", sub: "actualización automática" },
  ];

  return (
    <>
      {/* ─── HERO ─── */}
      <section className="relative border-b border-border">
        <div
          className="clara-hero-grid grid"
          style={{
            gridTemplateColumns: "1.1fr 1fr",
            minHeight: "82vh",
          }}
        >
          {/* Left: content */}
          <div
            className="clara-hero-left flex flex-col justify-center relative"
            style={{ padding: "80px 48px" }}
          >
            <StaggerReveal delay={0.05}>
              <div className="flex items-center gap-2.5 mb-7 flex-wrap">
                <Pill tone="accent">
                  <Beacon color="var(--accent)" />
                  Argentina · últimas 24h
                </Pill>
                <span className="font-mono text-[10px] text-muted tracking-[0.1em]">
                  {timestamp} ART
                </span>
              </div>
            </StaggerReveal>

            <StaggerReveal delay={0.2}>
              {fireCount > 0 ? (
                <h1
                  className="clara-hero-h1 text-foreground m-0"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 800,
                    fontSize: "clamp(48px, 9vw, 128px)",
                    lineHeight: 0.92,
                    letterSpacing: "-0.04em",
                  }}
                >
                  <span
                    className="text-accent tabular-nums"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    <FireCounter count={fireCount} />
                  </span>
                  <br />
                  <span
                    className="clara-hero-h1-sub"
                    style={{
                      fontWeight: 300,
                      fontSize: "0.52em",
                      color:
                        "color-mix(in oklab, var(--foreground) 75%, transparent)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    focos de calor activos
                  </span>
                </h1>
              ) : (
                <h1
                  className="clara-hero-h1 text-foreground m-0"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontWeight: 800,
                    fontSize: "clamp(40px, 7vw, 96px)",
                    lineHeight: 0.95,
                    letterSpacing: "-0.04em",
                  }}
                >
                  <span className="text-accent">Monitoreo</span>
                  <br />
                  <span
                    className="clara-hero-h1-sub"
                    style={{
                      fontWeight: 300,
                      fontSize: "0.6em",
                      color:
                        "color-mix(in oklab, var(--foreground) 75%, transparent)",
                    }}
                  >
                    sin focos detectados
                  </span>
                </h1>
              )}
            </StaggerReveal>

            <StaggerReveal delay={0.35}>
              <p
                className="mt-8"
                style={{
                  maxWidth: "48ch",
                  fontSize: 16,
                  lineHeight: 1.55,
                  color:
                    "color-mix(in oklab, var(--foreground) 70%, transparent)",
                }}
              >
                Detectamos focos de calor en tiempo real en toda Argentina con
                satélites de la NASA. Si hay uno cerca tuyo y el viento empuja
                el humo hacia tu zona, recibís una alerta por Telegram con
                distancia, dirección y ETA.
              </p>
            </StaggerReveal>

            <StaggerReveal delay={0.5}>
              <div className="clara-stack-mobile clara-hero-badges flex flex-wrap gap-3 mt-9">
                <a
                  href={TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="clara-tap clara-fullwidth-mobile inline-flex items-center justify-center gap-2.5 text-white font-semibold transition-all active:scale-[0.98]"
                  style={{
                    padding: "14px 22px",
                    borderRadius: 12,
                    background: "var(--accent)",
                    fontSize: 15,
                    boxShadow: "0 10px 30px -10px var(--accent)",
                  }}
                >
                  <TelegramLogo size={16} weight="fill" />
                  Activar alertas · Telegram
                  <ArrowRight size={14} />
                </a>
                <Link
                  href="/mapa"
                  className="clara-tap clara-fullwidth-mobile inline-flex items-center justify-center gap-2.5 transition-colors"
                  style={{
                    padding: "14px 22px",
                    borderRadius: 12,
                    background: "transparent",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    fontWeight: 500,
                    fontSize: 15,
                  }}
                >
                  <GlobeHemisphereWest size={16} weight="duotone" />
                  Ver mapa nacional
                </Link>
              </div>
            </StaggerReveal>

            {/* Data strip */}
            <StaggerReveal delay={0.65}>
              <div
                className="clara-data-strip grid mt-14 pt-6 border-t border-border"
                style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}
              >
                {[
                  ["Sensor", "VIIRS 375m"],
                  ["Cadencia", "15 min"],
                  ["Cobertura", "3.761.274 km²"],
                  ["Ciudades", "78 / 24 prov."],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="font-mono text-[9px] text-muted tracking-[0.15em] uppercase mb-1">
                      {k}
                    </div>
                    <div
                      className="font-mono text-[13px] text-foreground font-medium"
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </StaggerReveal>
          </div>

          {/* Right: map */}
          <div
            className="clara-hero-map relative border-l border-border"
            style={{ minHeight: 480 }}
          >
            <FireMapLoader />
            {/* Overlay badge */}
            <div
              className="absolute top-4 left-4 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border z-[500]"
              style={{
                background: "color-mix(in oklab, var(--background) 80%, transparent)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              <GlobeHemisphereWest size={12} className="text-accent" />
              <span className="font-mono text-[10px] text-muted tracking-[0.08em]">
                NASA FIRMS VIIRS · NRT
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── METRICS STRIP ─── */}
      <section className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div
          className="clara-metrics max-w-[1400px] mx-auto grid"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className="relative"
              style={{
                padding: "28px 32px",
                borderRight:
                  i < metrics.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-2.5">
                {m.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 42,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color:
                    m.tone === "accent" ? "var(--accent)" : "var(--foreground)",
                  lineHeight: 1,
                }}
              >
                {m.value}
              </div>
              <div className="font-mono text-[10px] text-muted mt-2">
                {m.sub}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="border-b border-border">
        <div
          className="clara-section-padded max-w-[1400px] mx-auto"
          style={{ padding: "80px 32px" }}
        >
          <div
            className="clara-two-col grid"
            style={{ gridTemplateColumns: "1fr 2fr", gap: 64 }}
          >
            <div>
              <Pill>¿Cómo funciona?</Pill>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 44,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                  margin: "20px 0 16px",
                }}
              >
                Del satélite al{" "}
                <span className="text-accent">bolsillo</span>
                <br /> en 15 minutos.
              </h2>
              <p
                className="text-muted"
                style={{ fontSize: 15, lineHeight: 1.6, maxWidth: "42ch" }}
              >
                Cuatro pasos automáticos que se ejecutan sin intervención
                humana. El proceso entero corre en Postgres con pg_cron +
                pg_net.
              </p>
            </div>
            <div
              className="clara-steps grid"
              style={{ gridTemplateColumns: "1fr 1fr", gap: 24 }}
            >
              {STEPS.map((s) => (
                <div
                  key={s.n}
                  style={{
                    padding: 24,
                    borderRadius: 12,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="font-mono text-[10px] text-accent tracking-[0.15em]">
                      {s.n}
                    </span>
                    <span className="text-accent inline-flex">{s.icon}</span>
                  </div>
                  <div className="font-semibold text-[15px] mb-1.5 text-foreground">
                    {s.title}
                  </div>
                  <div
                    className="text-muted"
                    style={{ fontSize: 13, lineHeight: 1.55 }}
                  >
                    {s.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── LIVE CITIES ─── */}
      <section className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div
          className="clara-section-padded max-w-[1400px] mx-auto"
          style={{ padding: "64px 32px" }}
        >
          <div className="flex items-end justify-between mb-7 gap-5 flex-wrap">
            <div>
              <Pill>Estado en vivo</Pill>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  margin: "14px 0 0",
                }}
              >
                Calidad del aire por ciudad
              </h2>
            </div>
            <Link
              href="/calidad-aire"
              className="inline-flex items-center gap-1.5 text-accent text-[14px] font-medium"
            >
              Ver las 78 ciudades <ArrowRight size={14} />
            </Link>
          </div>
          <LiveCityGrid count={12} />
        </div>
      </section>

      {/* ─── DATA SOURCES ─── */}
      <section className="border-b border-border" style={{ background: "var(--surface)" }}>
        <div
          className="clara-section-padded max-w-[1400px] mx-auto"
          style={{ padding: "72px 32px" }}
        >
          <div className="flex items-end justify-between gap-6 flex-wrap mb-8">
            <div>
              <Pill>
                <GlobeHemisphereWest size={10} /> Fuentes de datos
              </Pill>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 36,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  margin: "14px 0 10px",
                  lineHeight: 1.05,
                }}
              >
                Datos abiertos de{" "}
                <span className="text-accent">agencias espaciales</span>
                <br />y servicios climáticos globales.
              </h2>
              <p
                className="text-muted"
                style={{ fontSize: 14, margin: 0, maxWidth: "60ch" }}
              >
                Todo el sistema se construye sobre datos públicos verificables.
                Ninguna fuente propietaria, ninguna caja negra.
              </p>
            </div>
          </div>
          <div
            className="clara-source-grid grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {DATA_SOURCES.map((s) => (
              <div
                key={s.name}
                className="group relative overflow-hidden flex flex-col"
                style={{
                  padding: 18,
                  borderRadius: 12,
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  gap: 10,
                  transition: "border-color 0.2s, transform 0.2s",
                }}
              >
                <div
                  className="absolute -top-5 -right-5 rounded-full"
                  style={{
                    width: 80,
                    height: 80,
                    background: s.color,
                    opacity: 0.08,
                    filter: "blur(20px)",
                  }}
                />
                <div
                  className="grid place-items-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: s.color + "18",
                    color: s.color,
                    border: `1px solid ${s.color}30`,
                  }}
                >
                  <DataSourceLogo name={s.icon} color={s.color} />
                </div>
                <div>
                  <div className="font-semibold text-[14px] text-foreground">
                    {s.name}
                  </div>
                  <div className="font-mono text-[10px] text-muted mt-1 tracking-wide">
                    {s.sub}
                  </div>
                </div>
                <div
                  className="mt-auto pt-2 flex justify-between font-mono uppercase"
                  style={{
                    borderTop: "1px solid var(--border)",
                    fontSize: 9,
                    color: "var(--muted)",
                    letterSpacing: "0.1em",
                  }}
                >
                  <span>{s.org}</span>
                  <span style={{ color: "var(--good)" }}>● Activo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HISTORIAL CTA CARD ─── */}
      <section className="border-b border-border">
        <div
          className="clara-section-padded max-w-[1400px] mx-auto"
          style={{ padding: "56px 32px" }}
        >
          <Link
            href="/historial"
            className="group relative flex items-center justify-between rounded-xl transition-all"
            style={{
              padding: "28px 28px",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <Pill tone="accent">Historial completo</Pill>
              <div
                className="mt-3 mb-1 font-semibold text-foreground"
                style={{ fontSize: 20 }}
              >
                Evolución de focos de calor en Argentina
              </div>
              <div className="text-muted text-[13px]">
                Agregación diaria desde NASA FIRMS · Backfill histórico
              </div>
            </div>
            <ArrowUpRight
              size={22}
              className="text-accent transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0 ml-4"
            />
          </Link>
        </div>
      </section>

      {/* ─── FINAL CTA — centered ─── */}
      <section className="border-b border-border relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, var(--accent-soft), transparent 60%)",
          }}
        />
        <div
          className="clara-cta-final relative mx-auto text-center"
          style={{ maxWidth: 720, padding: "96px 32px" }}
        >
          <Pill tone="accent" style={{ margin: "0 auto" }}>
            <Shield size={10} weight="duotone" /> Protegé tu zona
          </Pill>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(40px, 6vw, 72px)",
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              margin: "24px 0 20px",
            }}
          >
            Recibí la alerta{" "}
            <span className="text-accent">antes</span>
            <br /> de que llegue el humo.
          </h2>
          <p
            className="mx-auto text-muted"
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              maxWidth: "52ch",
              margin: "0 auto 36px",
            }}
          >
            Gratis. Sin registro. Sin publicidad. Un bot de Telegram mantenido
            por una comunidad de desarrolladores argentinos.
          </p>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3.5 text-white font-semibold transition-transform active:scale-[0.98]"
            style={{
              padding: "18px 28px",
              borderRadius: 14,
              background: "var(--accent)",
              fontSize: 17,
              textDecoration: "none",
              boxShadow: "0 20px 40px -16px var(--accent)",
            }}
          >
            <TelegramLogo size={18} weight="fill" /> Abrir @AlertaIncendiosBot{" "}
            <ArrowRight size={16} />
          </a>
          <div className="mt-5 font-mono text-[10px] text-muted tracking-[0.08em]">
            t.me/AlertaIncendiosBot
          </div>
        </div>
      </section>
    </>
  );
}
