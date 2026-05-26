import { ImageResponse } from "next/og";

// Apple touch icon — 180×180 PNG generado por Satori. iOS Safari lo usa para
// "Add to Home Screen" y crawlers legacy (Twitter, Slack preview) que no
// parsean SVG. Replica el pin con llama del logo AlertaForestal.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0a0a08",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 48 48"
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
      </div>
    ),
    { ...size },
  );
}
