/**
 * How the smoke and fire-front projection reads on the map (WHI-907 part 11).
 *
 * Lessons from the hurricane "cone of uncertainty" (Broad et al. 2007, Padilla
 * et al. 2017): people read the edge as the size of the danger and "outside"
 * as safe. So the legend says it is an estimate, every front line carries its
 * time written out (not only a colour), and expired shapes are hidden.
 */
export const SMOKE_LEGEND = "Hacia dónde va el humo (próximas 3 h)";
export const FRONT_LEGEND = "Hasta dónde podría avanzar el fuego si el viento se mantiene";
export const VARIABLE_LEGEND = "Viento variable";
export const POSSIBLE_FIRE_LABEL = "Posible foco";

const ART_TIME = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

function artTime(at: Date | string): string {
  return ART_TIME.format(typeof at === "string" ? new Date(at) : at);
}

export function legendFooter(updatedAt: Date | string): string {
  return (
    "Es una estimación, no un límite. Fuera de la zona también puede llegar humo o fuego. " +
    `Seguí las indicaciones de Defensa Civil y bomberos. Actualizado ${artTime(updatedAt)}.`
  );
}

/** "+1 h (≈15:05)": how long, and the Argentina clock time it means. */
export function frontEtaLabel(etaMinutes: number, issuedAt: Date | string): string {
  const hours = Math.floor(etaMinutes / 60);
  const minutes = etaMinutes % 60;
  const span =
    hours === 0 ? `+${minutes} min` : minutes === 0 ? `+${hours} h` : `+${hours} h ${minutes} min`;
  const issued = typeof issuedAt === "string" ? Date.parse(issuedAt) : issuedAt.getTime();
  return `${span} (≈${artTime(new Date(issued + etaMinutes * 60_000))})`;
}

// Dark and dense near the fire, light and faint at +3 h. No red/green pairs.
const FRONT_STYLES = [
  { maxEta: 30, color: "#7c2d12", fillOpacity: 0.45 },
  { maxEta: 60, color: "#c2410c", fillOpacity: 0.32 },
  { maxEta: 120, color: "#f97316", fillOpacity: 0.2 },
  { maxEta: Infinity, color: "#fdba74", fillOpacity: 0.12 },
] as const;

export function frontStyle(etaMinutes: number): { color: string; fillOpacity: number } {
  const style = FRONT_STYLES.find((s) => etaMinutes <= s.maxEta) ?? FRONT_STYLES[FRONT_STYLES.length - 1];
  return { color: style.color, fillOpacity: style.fillOpacity };
}

export function windSourceLabel(source: string): string {
  if (source === "smn-wrf") return "SMN 4 km";
  if (source === "open-meteo") return "Open-Meteo";
  return "sin dato";
}

export function projectionIsCurrent(validTo: string, now: Date = new Date()): boolean {
  const validToMs = Date.parse(validTo);
  return Number.isFinite(validToMs) && now.getTime() <= validToMs;
}
