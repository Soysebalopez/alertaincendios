import { Fire, TelegramLogo } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { StatusBeacon } from "./status-beacon";

const TELEGRAM_BOT_URL = "https://t.me/AlertaIncendiosBot";

const NAV_LINKS = [
  { href: "/mapa", label: "Mapa" },
  { href: "/calidad-aire", label: "Aire" },
  { href: "/historial", label: "Historial" },
];

export function Nav() {
  return (
    <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b border-border">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-3">
          <Fire size={20} weight="fill" className="text-accent" />
          <span className="font-semibold tracking-tight text-foreground/90">
            CLARA
          </span>
          <span className="hidden lg:inline font-mono text-[10px] text-muted tracking-wide">
            Central de Localizacion y Alerta de Riesgo Ambiental
          </span>
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-mono text-xs text-muted hover:text-foreground/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-2 text-xs font-mono text-muted">
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
          <span className="hidden sm:inline">Recibir alertas</span>
        </a>
      </div>
    </nav>
  );
}
