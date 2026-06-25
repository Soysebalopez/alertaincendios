// Client-safe FWI fire-danger types + presentation helpers. No React/Leaflet/
// Supabase imports — importable from server components, client components, and
// Vitest alike. The Supabase repo has no generated types, so these interfaces
// are the contract (same pattern as FirePoint in firms.ts).

export type DangerClass = "bajo" | "moderado" | "alto" | "muy alto" | "extremo";

export const DANGER_CLASSES: DangerClass[] = ["bajo", "moderado", "alto", "muy alto", "extremo"];

// Provinces with calibrated FWI prevention zones (fire_danger/zones.py). Gates the
// /provincia/[id] pages, the prevention-alerts cron, and the bot's prevention
// coverage — add an id here when a province's zones go live on the Python side.
export const PREVENTION_PROVINCE_IDS: string[] = [
  // Phase 1 — Patagonia
  "tierra-del-fuego",
  "santa-cruz",
  "chubut",
  "rio-negro",
  "neuquen",
  // Phase 2 — Centro / Cuyo / Sierras / southern NOA
  "la-pampa",
  "mendoza",
  "san-luis",
  "cordoba",
  "san-juan",
  "la-rioja",
  "catamarca",
];

export interface ZoneForecastDay {
  target_date: string; // YYYY-MM-DD
  fwi: number;
  danger_class: DangerClass;
  temp: number | null;
  rh: number | null;
  wind: number | null;
  precip: number | null;
}

export interface DangerZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // [south, north, west, east]
  forecast: ZoneForecastDay[];
}

export interface ProvinceDanger {
  provinceId: string;
  provinceName: string;
  computedAt: string;
  dates: string[]; // the forecast target_dates, ordered
  zones: DangerZone[];
}

const COLORS: Record<DangerClass, string> = {
  bajo: "#4d8f54", // --good
  moderado: "#bd8512", // --warn
  alto: "#d2541d", // --bad
  "muy alto": "#c23a3a", // --danger
  extremo: "#c23a3a", // --danger (intensified by label)
};

export function dangerColor(c: DangerClass): string {
  return COLORS[c];
}

export function dangerPillTone(c: DangerClass): "good" | "warn" | "bad" | "danger" {
  switch (c) {
    case "bajo":
      return "good";
    case "moderado":
      return "warn";
    case "alto":
      return "bad";
    default:
      return "danger"; // muy alto, extremo
  }
}

export function worstClass(classes: DangerClass[]): DangerClass {
  let worst = 0;
  for (const c of classes) {
    const i = DANGER_CLASSES.indexOf(c);
    if (i > worst) worst = i;
  }
  return DANGER_CLASSES[worst];
}

export function provinceBbox(zones: Pick<DangerZone, "bbox">[]): [number, number, number, number] {
  const s = Math.min(...zones.map((z) => z.bbox[0]));
  const n = Math.max(...zones.map((z) => z.bbox[1]));
  const w = Math.min(...zones.map((z) => z.bbox[2]));
  const e = Math.max(...zones.map((z) => z.bbox[3]));
  return [s, n, w, e];
}

export function forecastDateLabel(dateStr: string, todayStr: string): string {
  const day = Date.parse(`${dateStr}T00:00:00Z`);
  const today = Date.parse(`${todayStr}T00:00:00Z`);
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff > 1) return `+${diff} días`;
  return dateStr;
}

// Citizen-language copy per danger class: what it means + what to do. Shown under
// the overall pill in the danger panel. Generic by class (a level means the same
// in any zone). Spanish, plain, escalating in tone.
export const DANGER_COPY: Record<DangerClass, { summary: string; action: string }> = {
  bajo: {
    summary: "Las condiciones son poco favorables para que un fuego se inicie o se propague.",
    action: "Mantené las precauciones de siempre con el fuego.",
  },
  moderado: {
    summary: "Un fuego puede iniciarse y avanzar si hay sequedad o viento.",
    action: "Cuidado al usar fuego al aire libre. Apagá bien colillas y brasas.",
  },
  alto: {
    summary: "Las condiciones favorecen que un incendio se inicie y se propague rápido.",
    action: "Evitá fuego al aire libre, quemas y asados. Reportá cualquier humo.",
  },
  "muy alto": {
    summary: "Un incendio puede iniciarse con facilidad y avanzar rápido y con intensidad.",
    action: "No hagas ningún fuego al aire libre. Atento a avisos de las autoridades.",
  },
  extremo: {
    summary: "Condiciones críticas: cualquier chispa puede provocar un incendio difícil de controlar.",
    action: "Prohibido todo fuego al aire libre. Preparate por si hay que evacuar y seguí a las autoridades.",
  },
};

export function dangerCopy(c: DangerClass): { summary: string; action: string } {
  return DANGER_COPY[c];
}
