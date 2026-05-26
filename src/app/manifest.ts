import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlertaForestal — Alertas tempranas de incendios forestales",
    short_name: "AlertaForestal",
    description:
      "Sistema gratuito de alerta temprana de incendios forestales en Argentina. Detección satelital NASA + NOAA, alertas por Telegram.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a08",
    theme_color: "#0a0a08",
    lang: "es-AR",
    orientation: "portrait",
    categories: ["utilities", "weather", "news"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
