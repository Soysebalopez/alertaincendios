export function WebsiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AlertaForestal",
    alternateName: "Alertas tempranas de incendios forestales",
    description:
      "Sistema de alerta temprana de incendios forestales en Argentina. Detección satelital y alertas por Telegram con modelo de dispersión de humo.",
    url:
      process.env.NEXT_PUBLIC_SITE_URL || "https://alertaforestal.org",
    applicationCategory: "BrowserApplication",
    operatingSystem: "Web",
    inLanguage: "es-AR",
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "Argentina",
      },
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "ARS",
    },
    publisher: {
      "@type": "Organization",
      name: "Whitebay",
    },
  };

  // JSON.stringify on static data is safe — no user input
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function CityJsonLd({
  cityName,
  provinceName,
  lat,
  lng,
  url,
}: {
  cityName: string;
  provinceName: string;
  lat: number;
  lng: number;
  url: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${cityName}, ${provinceName} — Focos forestales y calidad del aire`,
    description: `Focos forestales cerca de ${cityName}, calidad del aire y monitoreo ambiental en tiempo real. Alertas tempranas por Telegram.`,
    inLanguage: "es-AR",
    url,
    isPartOf: {
      "@type": "WebApplication",
      name: "AlertaForestal",
    },
    about: {
      "@type": "Place",
      name: cityName,
      address: {
        "@type": "PostalAddress",
        addressRegion: provinceName,
        addressCountry: "AR",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: lat,
        longitude: lng,
      },
    },
  };

  // JSON.stringify on known static + prop data is safe — props come from argentina-cities.ts
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/**
 * BreadcrumbList for city pages — habilita el breadcrumb visual en SERP
 * (Inicio → Calidad del aire → Provincia → Ciudad), +CTR ~5-10% según data
 * pública de Google. JSON inline como text node es válido en React 19 para
 * application/ld+json — más seguro que dangerouslySetInnerHTML y suficiente
 * cuando el contenido viene de props controlados (PROVINCES).
 */
export function CityBreadcrumbJsonLd({
  cityName,
  provinceName,
  provinceId,
  citySlug,
  siteUrl,
}: {
  cityName: string;
  provinceName: string;
  provinceId: string;
  citySlug: string;
  siteUrl: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Inicio",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Calidad del aire",
        item: `${siteUrl}/calidad-aire`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: provinceName,
        item: `${siteUrl}/calidad-aire#${provinceId}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: cityName,
        item: `${siteUrl}/ciudad/${provinceId}/${citySlug}`,
      },
    ],
  };

  return (
    <script type="application/ld+json">{JSON.stringify(data)}</script>
  );
}
