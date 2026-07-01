import type { NextConfig } from "next";

// Content-Security-Policy — baseline policy (audit M20). Intentionally permissive
// on inline script/style (Next 16 + Leaflet inject inline) to avoid breaking the
// app, while still restricting framing, object/base-uri, and the set of origins
// the browser may reach. External origins actually used by the browser:
//   - map tiles: *.basemaps.cartocdn.com (Leaflet)
//   - auth (dashboard/login): *.supabase.co (@supabase/ssr browser client)
//   - analytics: Vercel (script + same-origin beacon)
// All weather/AI/Telegram calls are server-side, so they don't need connect-src.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.cartocdn.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://*.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

// WHI-586 — baseline security headers applied to every response.
// See https://owasp.org/www-project-secure-headers/ for rationale.
const securityHeaders = [
  // Force HTTPS for the next 2 years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Restrict resource origins + framing (audit M20).
  { key: "Content-Security-Policy", value: csp },
  // Block clickjacking — we never frame the site.
  { key: "X-Frame-Options", value: "DENY" },
  // Disable MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer leakage to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop legacy browser permissions we never use; keep geolocation for /mapa.
  // (interest-cohort removed — FLoC is deprecated/dead.)
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
