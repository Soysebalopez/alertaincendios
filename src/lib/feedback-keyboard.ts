/**
 * Feedback comunitario — teclado inline + parseo del callback_data.
 * Client-safe (sin imports server-only). Lo usan los send-paths (alerts /
 * goes-alerts) para adjuntar el teclado, y el webhook para parsear el voto.
 *
 * callback_data := "fb|<alert_id>|<code>"   (Telegram: límite duro 64 bytes UTF-8)
 *   alert_id := "f:<fire_key>" (FIRMS) | "g:<goes_preliminary.id>" (GOES)
 *   code ∈ { s, f, q, n, l }
 * Peor caso medido: 33 bytes (FIRMS). Ver FEEDBACK_COMUNITARIO_SPEC.md §2.2.
 */

export type FeedbackResponse = "humo" | "fuego" | "olor" | "nada" | "lejos";

// código de 1 char (en callback_data) → voto canónico (persistido en DB).
const CODE_TO_RESPONSE: Record<string, FeedbackResponse> = {
  s: "humo",
  f: "fuego",
  q: "olor",
  n: "nada",
  l: "lejos",
};

const LABELS: Record<string, string> = {
  f: "🔥 Veo fuego",
  s: "💨 Veo humo",
  q: "👃 Huelo a quemado",
  n: "🚫 No veo nada",
  l: "📍 Estoy lejos",
};

// Layout en filas (§3.1): "huelo a quemado" en fila propia; "nada"/"lejos" juntos.
const ROWS: string[][] = [
  ["f", "s"],
  ["q"],
  ["n", "l"],
];

export type InlineKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

/** Construye el reply_markup con los 5 botones de feedback para una alerta. */
export function buildFeedbackKeyboard(alertId: string): InlineKeyboard {
  return {
    inline_keyboard: ROWS.map((row) =>
      row.map((code) => ({
        text: LABELS[code],
        callback_data: `fb|${alertId}|${code}`,
      }))
    ),
  };
}

export type ParsedVote = {
  alertId: string;
  source: "firms" | "goes";
  response: FeedbackResponse;
};

/**
 * Parsea y valida el callback_data de un voto. Devuelve null si no es un
 * callback de feedback válido (prefijo, alert_id bien formado, código conocido).
 */
export function parseFeedbackCallback(
  data: string | undefined | null
): ParsedVote | null {
  if (!data) return null;
  const parts = data.split("|");
  if (parts.length !== 3 || parts[0] !== "fb") return null;
  const [, alertId, code] = parts;
  const response = CODE_TO_RESPONSE[code];
  if (!response) return null;
  let source: "firms" | "goes";
  if (alertId.startsWith("f:")) source = "firms";
  else if (alertId.startsWith("g:")) source = "goes";
  else return null;
  if (alertId.length <= 2) return null; // native key vacío
  return { alertId, source, response };
}
