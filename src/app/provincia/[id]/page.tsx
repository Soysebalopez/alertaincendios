import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROVINCES } from "@/lib/argentina-cities";
import { PREVENTION_PROVINCE_IDS } from "@/lib/fire-danger";
import { getProvinceDanger } from "@/lib/fire-danger-server";

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

  return (
    <main className="relative z-10 border-t border-border p-6">
      <h1 className="text-2xl font-bold">
        Peligro de incendios — {data?.provinceName ?? id}
      </h1>
      {!data ? (
        <p className="text-muted mt-3">Sin datos de pronóstico disponibles.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.zones.map((z) => (
            <li key={z.id} className="font-mono text-sm">
              {z.name}: {z.forecast[0]?.danger_class ?? "—"} (FWI{" "}
              {z.forecast[0]?.fwi ?? "—"})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
