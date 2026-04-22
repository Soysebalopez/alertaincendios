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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://alertaincendios.vercel.app";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a08",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CLARA — Central de Localizacion y Alerta de Riesgo Ambiental",
    template: "%s — CLARA",
  },
  description:
    "Sistema de alerta temprana de incendios forestales para Argentina. Deteccion via NASA FIRMS VIIRS. Alertas por Telegram con modelo de dispersion de humo.",
  robots: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "CLARA",
    title: "CLARA — Alerta de Incendios Argentina",
    description:
      "Monitoreo ambiental ciudadano. Focos de calor, calidad del aire y alertas por Telegram para toda Argentina.",
    url: SITE_URL,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CLARA — Monitoreo ambiental ciudadano para Argentina",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CLARA — Alerta de Incendios Argentina",
    description:
      "Monitoreo ambiental ciudadano. Focos de calor, calidad del aire y alertas por Telegram.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${outfit.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-[100dvh] flex flex-col">{children}</body>
    </html>
  );
}
