import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Bell } from "@phosphor-icons/react/dist/ssr";
import { PROVINCES } from "@/lib/argentina-cities";
import { CityDashboard } from "@/components/city/city-dashboard";
import { CityJsonLd } from "@/components/jsonld";
import { Pill } from "@/components/clara-ui";

interface PageProps {
  params: Promise<{ province: string; city: string }>;
}

function findCity(provinceSlug: string, citySlug: string) {
  const province = PROVINCES.find((p) => p.id === provinceSlug);
  if (!province) return null;
  const city = province.cities.find((c) => slugify(c.name) === citySlug);
  if (!city) return null;
  return { province, city };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

const TELEGRAM_BOT_URL = "https://t.me/AlertaIncendiosBot";

export default async function CiudadPage({ params }: PageProps) {
  const { province, city } = await params;
  const match = findCity(province, city);
  if (!match) notFound();

  const otherCities = match.province.cities.filter(
    (c) => slugify(c.name) !== city,
  );

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://alertaincendios.vercel.app";

  return (
    <>
      <CityJsonLd
        cityName={match.city.name}
        provinceName={match.province.name}
        lat={match.city.lat}
        lng={match.city.lng}
        url={`${siteUrl}/ciudad/${match.province.id}/${city}`}
      />

      {/* Hero */}
      <section
        className="clara-section-padded border-b border-border"
        style={{ padding: "48px 32px 32px" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <Link
            href="/calidad-aire"
            className="inline-flex items-center gap-1.5 text-muted hover:text-accent transition-colors mb-4 font-mono text-[11px] uppercase"
            style={{ letterSpacing: "0.08em" }}
          >
            <ArrowLeft size={12} />
            Volver a provincias
          </Link>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <Pill>
                <MapPin size={10} weight="duotone" /> {match.city.name},{" "}
                {match.province.name} · {match.city.lat.toFixed(2)}°{" "}
                {match.city.lng.toFixed(2)}°
              </Pill>
              <h1
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "clamp(40px, 6vw, 80px)",
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                  lineHeight: 1,
                  margin: "14px 0 0",
                }}
              >
                {match.city.name}{" "}
                <span
                  className="text-muted"
                  style={{ fontWeight: 300, fontSize: "0.5em" }}
                >
                  {match.province.name}
                </span>
              </h1>
            </div>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="clara-tap inline-flex items-center gap-2.5 text-white font-semibold transition-transform active:scale-[0.98]"
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                background: "var(--accent)",
                fontSize: 13,
                textDecoration: "none",
                boxShadow: "0 10px 30px -14px var(--accent)",
              }}
            >
              <Bell size={14} weight="duotone" /> Suscribirme a alertas
            </a>
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className="clara-section-padded" style={{ padding: "32px" }}>
        <div className="max-w-[1400px] mx-auto">
          <CityDashboard
            cityName={match.city.name}
            provinceName={match.province.name}
            lat={match.city.lat}
            lng={match.city.lng}
          />
        </div>
      </section>

      {otherCities.length > 0 && (
        <section
          className="clara-section-padded border-t border-border"
          style={{ padding: "48px 32px" }}
        >
          <div className="max-w-[1400px] mx-auto">
            <p className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-3">
              Otras ciudades en {match.province.name}
            </p>
            <div className="flex flex-wrap gap-2">
              {otherCities.map((c) => (
                <Link
                  key={c.name}
                  href={`/ciudad/${match.province.id}/${slugify(c.name)}`}
                  className="text-[12px] text-muted hover:text-accent transition-colors"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
