import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://alertaforestal.org";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a08",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AlertaForestal — Alertas tempranas de incendios forestales en Argentina",
    template: "%s — AlertaForestal",
  },
  description:
    "Sistema gratuito de alerta temprana de incendios forestales en Argentina. Detección satelital NASA + NOAA. Alertas por Telegram en minutos.",
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
  // src/app/opengraph-image.tsx and src/app/twitter-image.tsx (WHI-582).
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "AlertaForestal",
    title: "AlertaForestal — Alertas de incendios forestales en Argentina",
    description:
      "Monitoreo y alerta temprana de focos forestales. Datos abiertos de NASA, NOAA y Copernicus. Alertas por Telegram para toda Argentina.",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "AlertaForestal — Alertas de incendios forestales en Argentina",
    description:
      "Detección temprana de focos forestales. Alertas por Telegram con distancia, dirección y ETA.",
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
      <body className="min-h-[100dvh] flex flex-col">{children}</body>
    </html>
  );
}
