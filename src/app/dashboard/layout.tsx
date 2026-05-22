import type { Metadata } from "next";
import Link from "next/link";
import { Flame, SignOut } from "@phosphor-icons/react/dist/ssr";
import { SignOutButton } from "./_components/signout-button";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/alerts", label: "Alertas" },
  { href: "/dashboard/health", label: "Pipelines" },
  { href: "/dashboard/superadmin", label: "Superadmin" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--background)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div
          className="max-w-[1400px] mx-auto flex items-center justify-between"
          style={{ padding: "12px 24px", gap: 24 }}
        >
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
              }}
            >
              <Flame size={14} weight="fill" color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>AlertaForestal</div>
              <div className="font-mono text-[9px] text-muted tracking-wider uppercase">
                Dashboard interno
              </div>
            </div>
          </Link>
          <nav style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--foreground)",
                  textDecoration: "none",
                  borderRadius: 6,
                }}
                className="hover:bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)]"
              >
                {n.label}
              </Link>
            ))}
            <SignOutButton>
              <SignOut size={14} /> Salir
            </SignOutButton>
          </nav>
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto" style={{ padding: "32px 24px" }}>
        {children}
      </main>
    </div>
  );
}
