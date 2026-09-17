import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SITE_URL as SITE_URL_CANONICO } from "@/lib/site-url";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = SITE_URL_CANONICO;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f4f1ea",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AlertaForestal — Alertas de incendios forestales en Argentina",
    template: "%s — AlertaForestal",
  },
  description:
    "Recibí alertas gratis por Telegram si hay un incendio cerca de donde vivís. Cobertura en todo el país, actualización cada 15 minutos.",
  // Canonical raíz + hreflang es-AR. Evita duplicados cuando la app responde
  // también en alertaincendios.vercel.app (preview/legacy) y le dice a Google
  // que el target geográfico es Argentina, no es-ES o es-MX. Las páginas hijas
  // heredan metadataBase y pueden override con su propio canonical relativo.
  alternates: {
    canonical: "/",
    languages: {
      "es-AR": "/",
      "x-default": "/",
    },
  },
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
  },
  // images for openGraph + twitter are auto-discovered from
  // src/app/opengraph-image.png and src/app/twitter-image.png.
  // Son PNG, no ya los .tsx de WHI-582: se diseñan en Agencia/Marca/og y se
  // regeneran con `node build.mjs` ahí. Cambiar el texto de la imagen NO se
  // hace acá.
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "AlertaForestal",
    title: "AlertaForestal — Alertas de incendios forestales en Argentina",
    description:
      "Si hay un incendio cerca de donde vivís y el viento va hacia tu lado, te avisamos por Telegram antes de que llegue el humo.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "AlertaForestal — Alertas de incendios forestales en Argentina",
    description:
      "Alertas gratis por Telegram si hay un incendio cerca tuyo. Actualización cada 15 minutos. Todo Argentina.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-AR"
      className={`${outfit.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-[100dvh] flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
