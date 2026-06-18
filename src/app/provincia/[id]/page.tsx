import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROVINCES } from "@/lib/argentina-cities";
import { PREVENTION_PROVINCE_IDS } from "@/lib/fire-danger";
import { getProvinceDanger } from "@/lib/fire-danger-server";
import { ProvinceView } from "@/components/danger/province-view";
import { ProvinceJsonLd } from "@/components/jsonld";

export const revalidate = 3600;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return PREVENTION_PROVINCE_IDS.map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const name = PROVINCES.find((p) => p.id === id)?.name ?? id;
  const title = `Peligro de incendios en ${name}`;
  const description = `Índice de peligro de incendio (FWI) por zona en ${name}, con pronóstico a 16 días. Prevención antes del foco.`;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: `/provincia/${id}` },
    openGraph: {
      title: `${title} — AlertaForestal`,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — AlertaForestal`,
      description,
    },
  };
}

export default async function ProvinciaPage({ params }: PageProps) {
  const { id } = await params;
  if (!PREVENTION_PROVINCE_IDS.includes(id)) notFound();
  const data = await getProvinceDanger(id);
  const today = new Date().toISOString().slice(0, 10);

  if (!data) {
    return (
      <main className="relative z-10 border-t border-border p-6">
        <p className="text-muted">Sin datos de pronóstico disponibles para esta provincia.</p>
      </main>
    );
  }
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://alertaforestal.org";
  const lat = data.zones.reduce((a, z) => a + z.lat, 0) / data.zones.length;
  const lng = data.zones.reduce((a, z) => a + z.lng, 0) / data.zones.length;

  return (
    <main className="relative z-10 border-t border-border">
      <ProvinceJsonLd
        provinceName={data.provinceName}
        lat={lat}
        lng={lng}
        url={`${siteUrl}/provincia/${id}`}
      />
      <ProvinceView data={data} today={today} />
    </main>
  );
}
