import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "CLARA — Central de Localizacion y Alerta de Riesgo Ambiental",
  description:
    "Sistema de alerta temprana de incendios forestales para Argentina. Deteccion via NASA FIRMS VIIRS. Alertas por Telegram con modelo de dispersion de humo.",
  openGraph: {
    title: "CLARA — Alerta de Incendios Argentina",
    description:
      "Recibí alertas de incendios forestales en tu zona via Telegram. Datos satelitales de NASA FIRMS.",
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
      <body className="min-h-[100dvh] flex flex-col grain">{children}</body>
    </html>
  );
}
