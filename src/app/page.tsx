import Link from "next/link";

const FIRMS_MAP_URL =
  "https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;l:noaa21-viirs-c2,viirs-i-fires;@-64,-38,5z";

const TELEGRAM_BOT_URL = "https://t.me/AlertaIncendiosArgBot";

async function getFireCount(): Promise<number> {
  try {
    const res = await fetch(
      "https://firms.modaps.eosdis.nasa.gov/api/area/csv/OPEN_KEY/VIIRS_SNPP_NRT/-73.6,-55.1,-53.6,-21.8/1",
      { next: { revalidate: 900 } }
    );
    if (!res.ok) return 0;
    const text = await res.text();
    const lines = text.trim().split("\n");
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
  }
}

export default async function Home() {
  const fireCount = await getFireCount();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <h1 className="text-lg font-semibold tracking-tight">
            AlertaIncendios
          </h1>
        </div>
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-accent hover:bg-accent-muted text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Recibir alertas
        </a>
      </header>

      {/* Hero section */}
      <section className="px-6 py-12 max-w-2xl">
        <p className="font-mono text-xs text-accent uppercase tracking-widest mb-3">
          Argentina — últimas 24h
        </p>
        <h2 className="text-4xl font-bold tracking-tight leading-tight mb-4">
          {fireCount > 0 ? (
            <>
              <span className="text-accent">{fireCount}</span> focos de calor
              detectados
            </>
          ) : (
            "Monitoreo de incendios en tiempo real"
          )}
        </h2>
        <p className="text-lg text-foreground/60 leading-relaxed max-w-lg">
          Detectamos focos de calor en toda Argentina via satélite y te alertamos
          por Telegram si hay uno cerca de tu ubicación.
        </p>
      </section>

      {/* Map */}
      <section className="flex-1 min-h-[500px] border-t border-b border-border relative">
        <iframe
          src={FIRMS_MAP_URL}
          className="w-full h-full min-h-[500px] border-0"
          title="Mapa de focos de calor — NASA FIRMS"
          loading="lazy"
        />
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-3xl">
        <h3 className="font-mono text-xs text-foreground/40 uppercase tracking-widest mb-8">
          Cómo funciona
        </h3>
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-mono text-accent text-sm mb-2">01</p>
            <p className="font-medium mb-1">Suscribite</p>
            <p className="text-sm text-foreground/50">
              Abrí el bot en Telegram y compartí tu ubicación o escribí tu
              ciudad.
            </p>
          </div>
          <div>
            <p className="font-mono text-accent text-sm mb-2">02</p>
            <p className="font-medium mb-1">Monitoreamos</p>
            <p className="text-sm text-foreground/50">
              Cada 15 minutos consultamos los satélites de NASA para detectar
              focos de calor nuevos.
            </p>
          </div>
          <div>
            <p className="font-mono text-accent text-sm mb-2">03</p>
            <p className="font-medium mb-1">Te alertamos</p>
            <p className="text-sm text-foreground/50">
              Si hay un foco cerca tuyo y el viento lo dirige hacia tu zona,
              recibís una alerta con distancia y ETA del humo.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-12 border-t border-border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-accent hover:bg-accent-muted text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Abrir bot en Telegram
          </a>
          <p className="text-sm text-foreground/40">
            Gratis. Sin registro. Solo necesitás Telegram.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-xs text-foreground/30">
        <p>
          Datos: NASA FIRMS VIIRS · Open-Meteo · Proyecto{" "}
          <Link href="https://monitorbb.netlify.app" className="underline">
            Whitebay
          </Link>
        </p>
      </footer>
    </div>
  );
}
