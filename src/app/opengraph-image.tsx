import { ImageResponse } from "next/og";

export const alt = "AlertaForestal — Alertas tempranas de incendios forestales en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Auto-generated OG image. Uses Next.js's next/og (Satori under the hood),
// so the layout is built with a CSS subset — no shadows, no exotic positioning.
// Matches el terminal-refined aesthetic del landing.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a08",
          display: "flex",
          flexDirection: "column",
          padding: "64px 80px",
          position: "relative",
          color: "#d4d4cc",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Coordinate grid (subtle, ember-toned) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(rgba(232,98,44,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(232,98,44,0.06) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            display: "flex",
          }}
        />

        {/* Ember glow top-right */}
        <div
          style={{
            position: "absolute",
            top: -240,
            right: -240,
            width: 720,
            height: 720,
            background:
              "radial-gradient(circle, rgba(232,98,44,0.22) 0%, rgba(232,98,44,0) 70%)",
            borderRadius: 9999,
            display: "flex",
          }}
        />

        {/* Top — brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, zIndex: 10 }}>
          {/* Pin de mapa con llama — logo oficial AlertaForestal */}
          <svg
            width="72"
            height="72"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M 24 4 C 33 4 40 11 40 20 C 40 30 24 44 24 44 C 24 44 8 30 8 20 C 8 11 15 4 24 4 Z"
              fill="#e8622c"
            />
            <path
              d="M 24 11 C 26 14 30 17 30 21 A 6 7 0 1 1 18 21 C 18 17 20 16 21 15 C 20 17 21 19 23 19 C 25 19 24 16 24 11 Z"
              fill="#ffffff"
            />
          </svg>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 54,
                fontWeight: 800,
                letterSpacing: "-0.025em",
                lineHeight: 1,
              }}
            >
              AlertaForestal
            </div>
            <div
              style={{
                color: "#8a8a7e",
                fontSize: 14,
                letterSpacing: "0.12em",
                fontFamily: "monospace",
                marginTop: 6,
              }}
            >
              ALERTAS TEMPRANAS DE INCENDIOS FORESTALES
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex" }} />

        {/* Headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              maxWidth: 980,
            }}
          >
            Alertas de incendios forestales en Argentina
          </div>
          <div
            style={{
              color: "rgba(212,212,204,0.68)",
              fontSize: 26,
              lineHeight: 1.4,
              maxWidth: 880,
            }}
          >
            Detectamos focos con satélites de NASA y NOAA y te avisamos por
            Telegram antes de que el humo llegue.
          </div>
        </div>

        <div style={{ flex: 1, display: "flex" }} />

        {/* Bottom — data strip + URL */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#8a8a7e",
            fontSize: 18,
            fontFamily: "monospace",
            letterSpacing: "0.06em",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <span>NASA FIRMS</span>
            <span style={{ color: "#3a3a30" }}>·</span>
            <span>NOAA GOES-19</span>
            <span style={{ color: "#3a3a30" }}>·</span>
            <span>78 ciudades</span>
            <span style={{ color: "#3a3a30" }}>·</span>
            <span style={{ color: "#e8622c", fontWeight: 700 }}>GRATIS</span>
          </div>
          <div style={{ color: "#d4d4cc", fontWeight: 600 }}>
            alertaforestal.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
