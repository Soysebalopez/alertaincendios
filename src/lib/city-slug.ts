import { PROVINCES, type City, type Province } from "@/lib/argentina-cities";

/** URL slug of a city name: "Bahía Blanca" → "bahia-blanca". */
export function citySlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function findCityBySlug(slug: string): { city: City; province: Province } | null {
  const matches = PROVINCES.flatMap((province) =>
    province.cities.filter((c) => citySlug(c.name) === slug).map((city) => ({ city, province }))
  );
  // Rawson exists in Chubut and in San Juan: a slug that names two places names
  // none, so a link can never subscribe someone to the wrong one.
  return matches.length === 1 ? matches[0] : null;
}
