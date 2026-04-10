import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PROVINCES } from "@/lib/argentina-cities";
import { CityDashboard } from "@/components/city/city-dashboard";
import { CityJsonLd } from "@/components/jsonld";
import { StaggerReveal } from "@/components/stagger-reveal";

interface PageProps {
  params: Promise<{ province: string; city: string }>;
}

function findCity(provinceSlug: string, citySlug: string) {
  const province = PROVINCES.find((p) => p.id === provinceSlug);
  if (!province) return null;
  const city = province.cities.find(
    (c) => slugify(c.name) === citySlug,
  );
  if (!city) return null;
  return { province, city };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function generateStaticParams() {
  const params: { province: string; city: string }[] = [];
  for (const prov of PROVINCES) {
    for (const city of prov.cities) {
      params.push({ province: prov.id, city: slugify(city.name) });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { province, city } = await params;
  const match = findCity(province, city);
  if (!match) return { title: "Ciudad no encontrada — CLARA" };

  const title = `${match.city.name}, ${match.province.name} — Calidad del Aire`;
  const description = `Monitoreo ambiental ciudadano para ${match.city.name}. Calidad del aire, viento y resumen en lenguaje simple.`;

  return {
    title,
    description,
    openGraph: {
      title: `${match.city.name} — Calidad del Aire — CLARA`,
      description,
    },
    twitter: {
      card: "summary",
      title: `${match.city.name} — CLARA`,
      description,
    },
  };
}

export default async function CiudadPage({ params }: PageProps) {
  const { province, city } = await params;
  const match = findCity(province, city);
  if (!match) notFound();

  const otherCities = match.province.cities.filter(
    (c) => slugify(c.name) !== city,
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://alertaincendios.vercel.app";

  return (
    <main className="relative z-10 flex-1">
      <CityJsonLd
        cityName={match.city.name}
        provinceName={match.province.name}
        lat={match.city.lat}
        lng={match.city.lng}
        url={`${siteUrl}/ciudad/${match.province.id}/${city}`}
      />
      <div className="px-6 md:px-10 lg:px-16 py-16 max-w-6xl mx-auto">
        <StaggerReveal delay={0.1}>
          <Link
            href="/calidad-aire"
            className="inline-flex items-center gap-2 text-xs text-muted hover:text-accent transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Calidad del aire
          </Link>

          <div className="mb-10">
            <p className="font-mono text-xs text-accent uppercase tracking-[0.2em] mb-3">
              {match.province.name}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tighter text-foreground/90">
              {match.city.name}
            </h1>
          </div>
        </StaggerReveal>

        <StaggerReveal delay={0.3}>
          <CityDashboard
            cityName={match.city.name}
            provinceName={match.province.name}
            lat={match.city.lat}
            lng={match.city.lng}
          />
        </StaggerReveal>

        {/* Other cities in province */}
        {otherCities.length > 0 && (
          <StaggerReveal delay={0.5}>
            <div className="mt-12 pt-8 border-t border-border">
              <p className="font-mono text-xs text-muted uppercase tracking-[0.15em] mb-4">
                Otras ciudades en {match.province.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {otherCities.map((c) => (
                  <Link
                    key={c.name}
                    href={`/ciudad/${match.province.id}/${slugify(c.name)}`}
                    className="text-xs text-muted hover:text-accent border border-border rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          </StaggerReveal>
        )}
      </div>
    </main>
  );
}
