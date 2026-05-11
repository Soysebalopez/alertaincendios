import type { NextConfig } from "next";

// WHI-586 — baseline security headers applied to every response.
// See https://owasp.org/www-project-secure-headers/ for rationale.
const securityHeaders = [
  // Force HTTPS for the next 2 years, including subdomains.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Block clickjacking — we never frame the site.
  { key: "X-Frame-Options", value: "DENY" },
  // Disable MIME-type sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Limit referrer leakage to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Drop legacy browser permissions we never use; keep geolocation for /mapa.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()" },
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
