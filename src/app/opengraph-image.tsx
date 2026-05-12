import { ImageResponse } from "next/og";

export const alt = "C.L.A.R.A. — Alertas de incendios forestales en Argentina";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Auto-generated OG image. Uses Next.js's next/og (Satori under the hood),
// so the layout is built with a CSS subset — no shadows, no exotic positioning.
// Matches the C.L.A.R.A. terminal-refined aesthetic from the landing.
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
          <div
            style={{
              width: 72,
              height: 72,
              background:
                "linear-gradient(135deg, #e8622c 0%, #c43c0c 100%)",
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Inline flame SVG to avoid emoji-font dependency */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2c-1.5 3-4 5-4 8a4 4 0 0 0 1 2.7c-2 .8-3 2.5-3 4.3a5 5 0 0 0 10 0c0-2-1.5-3.5-1.5-5.5 0 0-1 1-2 1 1-2 2-4 0-6.5-.5-.7-.5-3-.5-4z"
                fill="#fff"
              />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 48,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              C.L.A.R.A.
            </div>
            <div
              style={{
                color: "#8a8a7e",
                fontSize: 13,
                letterSpacing: "0.14em",
                fontFamily: "monospace",
                marginTop: 6,
              }}
            >
              CENTRAL DE LOCALIZACIÓN Y ALERTA DE RIESGO AMBIENTAL
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
            <span>80+ ciudades</span>
            <span style={{ color: "#3a3a30" }}>·</span>
            <span style={{ color: "#e8622c", fontWeight: 700 }}>GRATIS</span>
          </div>
          <div style={{ color: "#d4d4cc", fontWeight: 600 }}>
            alertaincendios.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
