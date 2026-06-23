/**
 * Preferences menu — inline keyboard builder + callback parser.
 * Client-safe (no server-only imports). Controls optional notification layers:
 * lightning toggle and prevention mode (off / alerts / daily).
 * Prevention rows are only shown when `covered` is true (sub's location is
 * in a covered FWI zone).
 *
 * callback_data format:
 *   "prefs|lightning"        — toggle lightning alerts
 *   "prefs|prev:<mode>"      — set prevention mode (off | alerts | daily)
 */

export type PreventionMode = "off" | "alerts" | "daily";

export interface PreferencesState {
  lightning: boolean;
  prevention: PreventionMode;
  covered: boolean; // sub's location falls in a covered FWI zone
}

export type InlineKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

export type PreferencesAction =
  | { kind: "lightning" }
  | { kind: "prevention"; mode: PreventionMode };

const PREVENTION_MODES: PreventionMode[] = ["off", "alerts", "daily"];

export function buildPreferencesKeyboard(state: PreferencesState): InlineKeyboard {
  const rows: { text: string; callback_data: string }[][] = [];

  rows.push([
    {
      text: `⚡ Rayos: ${state.lightning ? "✅ Activado" : "❌ Desactivado"}`,
      callback_data: "prefs|lightning",
    },
  ]);

  if (state.covered) {
    rows.push([
      { text: `${state.prevention === "daily" ? "🔘 " : ""}Resumen diario`, callback_data: "prefs|prev:daily" },
      { text: `${state.prevention === "alerts" ? "🔘 " : ""}Solo si hay peligro`, callback_data: "prefs|prev:alerts" },
    ]);
    rows.push([
      { text: `${state.prevention === "off" ? "🔘 " : "🌲 "}Prevención: No, gracias`, callback_data: "prefs|prev:off" },
    ]);
  }

  return { inline_keyboard: rows };
}

export function parsePreferencesCallback(data: string | null | undefined): PreferencesAction | null {
  if (!data || !data.startsWith("prefs|")) return null;
  const rest = data.slice("prefs|".length);
  if (rest === "lightning") return { kind: "lightning" };
  if (rest.startsWith("prev:")) {
    const mode = rest.slice("prev:".length) as PreventionMode;
    if (PREVENTION_MODES.includes(mode)) return { kind: "prevention", mode };
  }
  return null;
}
