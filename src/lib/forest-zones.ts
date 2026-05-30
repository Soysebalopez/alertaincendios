/**
 * Metadata de zonas forestales argentinas (client-safe).
 *
 * Los polígonos geográficos viven en `forest-zones-geo.ts` (server-only)
 * porque pesan ~170 KB en total y no queremos cargarlos en el bundle del
 * cliente. Acá quedan solo id + nombre, que es lo que viaja en
 * FirePoint.forestZone y se renderiza en tooltips / bot messages.
 *
 * IDs estables (WHI-757 → WHI-761): los polígonos cambiaron de hand-drawn
 * a MapBiomas Colección 2 (2024), pero los `id` se mantienen para que
 * FirePoint.forestZone, /api/fires y el bot Telegram sigan funcionando
 * sin migración de datos.
 */

export type ForestZone = {
  id: string;
  name: string;
};

export const FOREST_ZONES: readonly ForestZone[] = [
  { id: "andino-patagonico", name: "Bosque Andino Patagónico" },
  { id: "yungas", name: "Yungas" },
  { id: "selva-misionera", name: "Selva Misionera" },
  { id: "espinal-mesopotamico", name: "Espinal Mesopotámico" },
  { id: "sierras-cordoba", name: "Sierras de Córdoba" },
  { id: "chaco-norte", name: "Bosque Chaqueño Norte" },
  { id: "tierra-del-fuego", name: "Bosque Fueguino" },
] as const;

/**
 * Lookup del nombre legible a partir del id que viaja en FirePoint.forestZone.
 * Client-safe.
 */
export function forestZoneName(id?: string | null): string | null {
  if (!id) return null;
  return FOREST_ZONES.find((z) => z.id === id)?.name ?? null;
}
