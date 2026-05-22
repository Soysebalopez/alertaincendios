import { MetadataRoute } from "next";
import { PROVINCES } from "@/lib/argentina-cities";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Fecha fija del último cambio estructural del sitio (rebrand forestal).
// Sin esto, cada hit al sitemap devuelve `new Date()` y Google asume que
// todo cambió, gastando crawl budget en re-fetchear contenido idéntico.
// Bumpealo cuando hagas un cambio material de contenido o estructura.
const STATIC_LAST_MODIFIED = new Date("2026-05-21");

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://alertaforestal.org";

  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/mapa`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/calidad-aire`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/historial`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/como-funciona`,
      lastModified: STATIC_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // All city pages (~78)
  for (const prov of PROVINCES) {
    for (const city of prov.cities) {
      routes.push({
        url: `${baseUrl}/ciudad/${prov.id}/${slugify(city.name)}`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  }

  return routes;
}
