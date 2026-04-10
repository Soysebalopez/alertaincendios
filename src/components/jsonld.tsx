export function WebsiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CLARA",
    alternateName: "Central de Localizacion y Alerta de Riesgo Ambiental",
    description:
      "Sistema de monitoreo ambiental ciudadano para Argentina. Focos de calor, calidad del aire y alertas por Telegram.",
    url:
      process.env.NEXT_PUBLIC_SITE_URL || "https://alertaincendios.vercel.app",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
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
    name: `Calidad del aire en ${cityName}, ${provinceName}`,
    description: `Monitoreo ambiental ciudadano para ${cityName}. Niveles de contaminantes, viento y resumen en lenguaje simple.`,
    url,
    isPartOf: {
      "@type": "WebApplication",
      name: "CLARA",
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
