"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TelegramLogo,
  List,
  X,
  Flame,
} from "@phosphor-icons/react/dist/ssr";
import { StatusBeacon } from "./status-beacon";

const TELEGRAM_BOT_URL = "https://t.me/AlertaIncendiosBot";

const NAV_LINKS = [
  { href: "/", label: "Inicio" },
  { href: "/mapa", label: "Mapa" },
  { href: "/calidad-aire", label: "Calidad del aire" },
  { href: "/historial", label: "Historial" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ts, setTs] = useState<string>("");

  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        hour: "2-digit",
        minute: "2-digit",
      });
    const tick = () => setTs(fmt());
    const mountId = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(mountId);
      clearInterval(id);
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 border-b border-border"
      style={{
        background: "color-mix(in oklab, var(--background) 88%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-[1400px] mx-auto px-5 md:px-6 py-2.5 md:py-3.5 flex items-center justify-between gap-5">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 text-foreground">
          <div
            className="w-7 h-7 rounded-lg grid place-items-center shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              boxShadow: "0 0 12px var(--accent-soft)",
            }}
          >
            <Flame size={14} weight="fill" className="text-white" />
          </div>
          <div className="leading-none">
            <div
              className="text-[16px] font-bold tracking-tight"
              style={{ letterSpacing: "-0.01em" }}
            >
              CLARA
            </div>
            <div className="font-mono text-[9px] text-muted tracking-[0.12em] mt-0.5">
              MONITOREO AMBIENTAL · AR
            </div>
          </div>
        </Link>

        {/* Nav items */}
        <div className="clara-nav-items flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                style={{
                  background: active ? "var(--surface-2)" : "transparent",
                  color: active ? "var(--foreground)" : "var(--muted)",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2.5">
          <div
            className="clara-nav-live hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full border border-border"
            style={{ background: "var(--surface)" }}
          >
            <StatusBeacon />
            <span className="font-mono text-[10px] text-muted tracking-wider uppercase">
              En vivo · {ts} ART
            </span>
          </div>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="clara-cta-compact inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white transition-all active:scale-[0.98]"
            style={{
              background: "var(--accent)",
              boxShadow: "0 4px 14px -4px var(--accent)",
            }}
          >
            <TelegramLogo size={13} weight="fill" />
            <span className="clara-cta-text">Telegram</span>
          </a>
          <button
            className="clara-menu-btn hidden border border-border rounded-lg p-2 text-foreground cursor-pointer"
            style={{ background: "var(--surface)" }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menú"
          >
            {open ? <X size={16} /> : <List size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="border-t border-border px-3 py-3 flex flex-col gap-1"
          style={{ background: "color-mix(in oklab, var(--background) 92%, transparent)" }}
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2.5 rounded-lg text-[14px] font-medium clara-tap"
                style={{
                  background: active ? "var(--surface-2)" : "transparent",
                  color: active ? "var(--foreground)" : "var(--muted)",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
