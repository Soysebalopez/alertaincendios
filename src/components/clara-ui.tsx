import type { CSSProperties, ReactNode } from "react";

type PillTone = "default" | "accent" | "good" | "warn" | "bad" | "danger";

const PILL_TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  default: { bg: "var(--surface-2)", fg: "var(--muted)", bd: "var(--border)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--accent)", bd: "transparent" },
  good: { bg: "rgba(125,185,125,0.12)", fg: "var(--good)", bd: "transparent" },
  warn: { bg: "rgba(232,185,76,0.12)", fg: "var(--warn)", bd: "transparent" },
  bad: { bg: "rgba(232,122,76,0.15)", fg: "var(--bad)", bd: "transparent" },
  danger: { bg: "rgba(217,69,69,0.15)", fg: "var(--danger)", bd: "transparent" },
};

export function Pill({
  children,
  tone = "default",
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  style?: CSSProperties;
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full font-mono text-[10px] font-medium uppercase"
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        letterSpacing: "0.08em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Beacon({ color = "var(--accent)" }: { color?: string }) {
  return (
    <span
      className="relative inline-flex"
      style={{ width: 8, height: 8 }}
    >
      <span
        className="absolute inset-0 rounded-full beacon-ping"
        style={{ background: color, opacity: 0.4 }}
      />
      <span
        className="relative rounded-full"
        style={{
          width: 8,
          height: 8,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </span>
  );
}

/* ─── Data source logos — abstract SVG marks, not official brand logos ─── */
type LogoName = "nasa" | "noaa" | "esa" | "sentinel" | "openmeteo" | "telegram";

export function DataSourceLogo({
  name,
  color = "#fff",
  size = 22,
}: {
  name: LogoName;
  color?: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
  } as const;

  switch (name) {
    case "nasa":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill={color} opacity="0.15" />
          <ellipse
            cx="12"
            cy="12"
            rx="9"
            ry="3.5"
            stroke={color}
            strokeWidth="1.2"
            transform="rotate(-20 12 12)"
          />
          <circle cx="12" cy="12" r="2" fill={color} />
          <path
            d="M8 10c2 1 6 3 8 4"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "esa":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.3" />
          <path
            d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16"
            stroke={color}
            strokeWidth="1"
          />
        </svg>
      );
    case "sentinel":
      return (
        <svg {...common}>
          <rect
            x="9"
            y="9"
            width="6"
            height="6"
            rx="1"
            fill={color}
            opacity="0.3"
            stroke={color}
            strokeWidth="1.2"
          />
          <path
            d="M3 6l5 3M21 6l-5 3M3 18l5-3M21 18l-5-3"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.5" fill={color} />
        </svg>
      );
    case "openmeteo":
      return (
        <svg {...common}>
          <path
            d="M5 15a4 4 0 0 1 2-7.5 5 5 0 0 1 9.5 1A3.5 3.5 0 0 1 17 15H5z"
            fill={color}
            opacity="0.25"
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"
            stroke={color}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common}>
          <path
            d="M3 11l17-7-3 16-6-4-3 3v-5l10-8-12 7-3-2z"
            fill={color}
            opacity="0.3"
            stroke={color}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "noaa":
      // Geostationary satellite scanning Earth horizon (GOES-19).
      return (
        <svg {...common}>
          <path
            d="M2 20 Q12 14 22 20"
            stroke={color}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
          <rect
            x="10"
            y="5"
            width="4"
            height="3"
            rx="0.4"
            fill={color}
            opacity="0.3"
            stroke={color}
            strokeWidth="1.1"
          />
          <line x1="6" y1="6.5" x2="10" y2="6.5" stroke={color} strokeWidth="1" />
          <line x1="14" y1="6.5" x2="18" y2="6.5" stroke={color} strokeWidth="1" />
          <line x1="12" y1="8.2" x2="12" y2="16.5" stroke={color} strokeWidth="1.1" />
          <line
            x1="11"
            y1="8.5"
            x2="6.5"
            y2="18.5"
            stroke={color}
            strokeWidth="0.8"
            opacity="0.5"
          />
          <line
            x1="13"
            y1="8.5"
            x2="17.5"
            y2="18.5"
            stroke={color}
            strokeWidth="0.8"
            opacity="0.5"
          />
        </svg>
      );
  }
}
