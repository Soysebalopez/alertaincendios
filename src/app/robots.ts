import { MetadataRoute } from "next";
import { SITE_URL as SITE_URL_CANONICO } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_URL_CANONICO;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Defense-in-depth: las páginas ya tienen `robots: noindex,nofollow`
        // en metadata, pero bloquear acá evita crawl budget desperdiciado.
        disallow: ["/api/", "/dashboard", "/dashboard/", "/login", "/provincia/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
