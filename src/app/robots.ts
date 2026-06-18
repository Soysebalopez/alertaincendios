import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://alertaforestal.org";

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
