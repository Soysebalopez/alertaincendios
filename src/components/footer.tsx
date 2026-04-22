import Link from "next/link";
import { Flame } from "@phosphor-icons/react/dist/ssr";

const COLUMNS = [
  {
    title: "Plataforma",
    items: [
      { label: "Inicio", href: "/" },
      { label: "Mapa nacional", href: "/mapa" },
      { label: "Calidad del aire", href: "/calidad-aire" },
      { label: "Historial", href: "/historial" },
    ],
  },
  {
    title: "Bot",
    items: [
      { label: "@AlertaIncendiosBot", href: "https://t.me/AlertaIncendiosBot", external: true },
      { label: "Comandos", href: "https://t.me/AlertaIncendiosBot", external: true },
    ],
  },
  {
    title: "Datos",
    items: [
      { label: "NASA FIRMS", href: "https://firms.modaps.eosdis.nasa.gov/", external: true },
      { label: "Open-Meteo", href: "https://open-meteo.com/", external: true },
      { label: "Sentinel-5P", href: "https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-5p", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer
      className="clara-section-padded border-t border-border"
      style={{ background: "var(--surface)", padding: "48px 32px 32px" }}
    >
      <div className="max-w-[1400px] mx-auto">
        <div
          className="clara-footer-grid grid gap-8"
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}
        >
          <div>
            <div className="flex items-center gap-2.5 mb-3.5">
              <div
                className="w-7 h-7 rounded-lg grid place-items-center"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), var(--accent-2))",
                }}
              >
                <Flame size={14} weight="fill" className="text-white" />
              </div>
              <div>
                <div className="font-bold text-[15px]">CLARA</div>
                <div className="font-mono text-[9px] text-muted tracking-[0.1em]">
                  CENTRAL DE LOCALIZACIÓN Y ALERTA DE RIESGO AMBIENTAL
                </div>
              </div>
            </div>
            <p className="text-[13px] text-muted leading-relaxed max-w-[40ch]">
              Plataforma abierta de monitoreo ambiental ciudadano para
              Argentina. Un proyecto de Whitebay.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-3">
                {col.title}
              </div>
              {col.items.map((item) => {
                const base =
                  "block text-[13px] text-foreground/75 hover:text-foreground py-1 transition-colors";
                return "external" in item && item.external ? (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={base}
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.label} href={item.href} className={base}>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="max-w-[1400px] mx-auto mt-8 pt-6 border-t border-border flex flex-wrap justify-between gap-3 font-mono text-[10px] text-muted">
          <span>© {new Date().getFullYear()} Whitebay · Código abierto</span>
          <span>Hecho con ❤ en Argentina · Datos de dominio público</span>
        </div>
      </div>
    </footer>
  );
}
