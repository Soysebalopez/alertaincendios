import {
  Broadcast,
  MapPin,
  Wind,
  GlobeHemisphereWest,
  ArrowRight,
  TelegramLogo,
  Fire,
  Eye,
} from "@phosphor-icons/react/dist/ssr";
import { FireCounter } from "@/components/fire-counter";
import { StatusBeacon } from "@/components/status-beacon";
import { StaggerReveal } from "@/components/stagger-reveal";
import { EmberParticles } from "@/components/ember-particles";
import { FireMapLoader } from "@/components/fire-map-loader";

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

export default async function Home() {
  const fireCount = await getFireCount();
  const timestamp = new Date().toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col min-h-[100dvh] grid-overlay scanline relative">
      <EmberParticles />

      {/* ─── Nav ─── */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <Fire size={20} weight="fill" className="text-accent" />
          <span className="font-semibold tracking-tight text-foreground/90">
            AlertaIncendios
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted">
            <StatusBeacon />
            <span>Monitoreo activo</span>
          </div>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 bg-accent/10 hover:bg-accent/20 text-accent text-sm font-medium px-4 py-2 rounded-lg border border-accent/20 transition-all duration-300 active:scale-[0.98]"
          >
            <TelegramLogo size={16} weight="fill" />
            <span>Recibir alertas</span>
          </a>
        </div>
      </nav>

      {/* ─── Hero: Split-screen ─── */}
      <section className="relative z-10 grid grid-cols-1 lg:grid-cols-2 min-h-[85dvh]">
        {/* Left: Content */}
        <div className="flex flex-col justify-center px-6 md:px-10 lg:px-16 py-16 lg:py-0">
          <StaggerReveal delay={0.1}>
            <div className="flex items-center gap-3 mb-8">
              <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-full px-3 py-1.5">
                <StatusBeacon />
                <span className="font-mono text-xs text-muted tracking-wide uppercase">
                  En vivo
                </span>
              </div>
              <span className="font-mono text-xs text-muted">
                {timestamp} ART
              </span>
            </div>
          </StaggerReveal>

          <StaggerReveal delay={0.25}>
            <div className="mb-6">
              <p className="font-mono text-xs text-accent uppercase tracking-[0.2em] mb-4">
                Argentina / ultimas 24h
              </p>
              {fireCount > 0 ? (
                <h1 className="text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-none">
                  <span className="text-accent">
                    <FireCounter count={fireCount} />
                  </span>
                  <br />
                  <span className="text-foreground/80 text-4xl md:text-5xl lg:text-6xl font-light">
                    focos de calor
                  </span>
                </h1>
              ) : (
                <h1 className="text-5xl md:text-6xl font-bold tracking-tighter leading-none text-foreground/80">
                  Monitoreo activo
                  <br />
                  <span className="text-accent">sin focos detectados</span>
                </h1>
              )}
            </div>
          </StaggerReveal>

          <StaggerReveal delay={0.45}>
            <p className="text-base text-muted leading-relaxed max-w-[48ch] mb-10">
              Detectamos focos de calor en toda Argentina con satelites de la
              NASA. Si hay uno cerca tuyo, te alertamos por Telegram con la
              distancia y la direccion del humo.
            </p>
          </StaggerReveal>

          <StaggerReveal delay={0.6}>
            <div className="flex flex-col sm:flex-row items-start gap-4">
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 bg-accent hover:bg-accent-warm text-white font-medium px-6 py-3.5 rounded-xl transition-all duration-300 active:scale-[0.98]"
              >
                <TelegramLogo size={20} weight="fill" />
                <span>Activar alertas</span>
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </a>
              <span className="text-xs text-muted self-center">
                Gratis. Sin registro.
              </span>
            </div>
          </StaggerReveal>

          {/* Live data strip */}
          <StaggerReveal delay={0.8}>
            <div className="mt-16 pt-6 border-t border-border flex gap-8 md:gap-12">
              <DataPoint label="Sensor" value="VIIRS 375m" />
              <DataPoint label="Actualizacion" value="15 min" />
              <DataPoint label="Cobertura" value="3.761.274 km2" />
            </div>
          </StaggerReveal>
        </div>

        {/* Right: Map */}
        <div className="relative border-t lg:border-t-0 lg:border-l border-border min-h-[400px] lg:min-h-0">
          <FireMapLoader />
          {/* Map overlay badge */}
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 z-[1000]">
            <Eye size={14} className="text-accent" />
            <span className="font-mono text-[11px] text-muted">
              NASA FIRMS VIIRS — NRT
            </span>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="relative z-10 border-t border-border">
        <div className="px-6 md:px-10 lg:px-16 py-20 max-w-6xl">
          <StaggerReveal>
            <p className="font-mono text-xs text-muted uppercase tracking-[0.2em] mb-12">
              Como funciona
            </p>
          </StaggerReveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
            <StepCard
              number="01"
              icon={<MapPin size={20} weight="duotone" />}
              title="Comparti tu ubicacion"
              description="Abri el bot en Telegram y manda tu ubicacion GPS o escribi el nombre de tu ciudad. Nos sirve para calcular la distancia a cada foco."
              delay={0.1}
            />
            <StepCard
              number="02"
              icon={<GlobeHemisphereWest size={20} weight="duotone" />}
              title="Monitoreamos con satelites"
              description="Cada 15 minutos consultamos NASA FIRMS — el sistema VIIRS detecta puntos de calor anomalos con resolucion de 375 metros."
              delay={0.2}
            />
            <StepCard
              number="03"
              icon={<Wind size={20} weight="duotone" />}
              title="Modelo de dispersion"
              description="Cruzamos la posicion del foco con datos de viento en tiempo real. Calculamos si el humo se dirige hacia tu zona y en cuanto tiempo."
              delay={0.3}
            />
            <StepCard
              number="04"
              icon={<Broadcast size={20} weight="duotone" />}
              title="Te alertamos"
              description="Si un foco esta a menos de 100 km y el viento lo empuja hacia tu ubicacion, recibis una alerta instantanea con distancia, direccion y ETA."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* ─── Data sources ─── */}
      <section className="relative z-10 border-t border-border">
        <div className="px-6 md:px-10 lg:px-16 py-16">
          <p className="font-mono text-xs text-muted uppercase tracking-[0.2em] mb-8">
            Fuentes de datos
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              "NASA FIRMS VIIRS",
              "Open-Meteo Wind",
              "Sentinel SNPP",
              "Open-Meteo Geocoding",
            ].map((source) => (
              <span
                key={source}
                className="font-mono text-xs text-muted/80 border border-border rounded-full px-4 py-2"
              >
                {source}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="relative z-10 border-t border-border">
        <div className="px-6 md:px-10 lg:px-16 py-20">
          <StaggerReveal>
            <div className="flex flex-col md:flex-row items-start md:items-end gap-8 md:gap-16">
              <div>
                <p className="font-mono text-xs text-accent uppercase tracking-[0.2em] mb-4">
                  Protege tu zona
                </p>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tighter leading-tight max-w-md">
                  Recibi la alerta antes
                  <br />
                  de que llegue el humo
                </h2>
              </div>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 bg-accent hover:bg-accent-warm text-white font-medium px-8 py-4 rounded-xl transition-all duration-300 active:scale-[0.98]"
              >
                <TelegramLogo size={22} weight="fill" />
                <span>Abrir en Telegram</span>
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-1"
                />
              </a>
            </div>
          </StaggerReveal>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="relative z-10 border-t border-border px-6 md:px-10 lg:px-16 py-6 flex flex-col sm:flex-row justify-between gap-4">
        <p className="font-mono text-[11px] text-muted/60">
          Datos: NASA FIRMS VIIRS / Open-Meteo / ESA Copernicus
        </p>
        <p className="font-mono text-[11px] text-muted/60">
          Proyecto Whitebay — Codigo abierto
        </p>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] text-muted/60 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="font-mono text-sm text-foreground/70">{value}</p>
    </div>
  );
}

function StepCard({
  number,
  icon,
  title,
  description,
  delay = 0,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <StaggerReveal delay={delay}>
      <div className="group">
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-xs text-accent/50">{number}</span>
          <span className="text-accent">{icon}</span>
          <h3 className="font-semibold text-foreground/90">{title}</h3>
        </div>
        <p className="text-sm text-muted leading-relaxed max-w-[50ch] pl-[52px]">
          {description}
        </p>
      </div>
    </StaggerReveal>
  );
}
