import { MetadataRoute } from "next";
import { PROVINCES } from "@/lib/argentina-cities";
import { BAHIA_GENERIC_CITY_PATH, BAHIA_PAGE_PATH } from "@/lib/bahia-blanca";

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

  // WHI-907 — Bahía Blanca has its own page; its generic city URL redirects
  // there, so only the new one is listed.
  routes.push({
    url: `${baseUrl}${BAHIA_PAGE_PATH}`,
    lastModified: new Date("2026-09-14"),
    changeFrequency: "hourly",
    priority: 0.9,
  });

  // Every other city page (~77)
  for (const prov of PROVINCES) {
    for (const city of prov.cities) {
      const path = `/ciudad/${prov.id}/${slugify(city.name)}`;
      if (path === BAHIA_GENERIC_CITY_PATH) continue;
      routes.push({
        url: `${baseUrl}${path}`,
        lastModified: STATIC_LAST_MODIFIED,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  }

  return routes;
}
