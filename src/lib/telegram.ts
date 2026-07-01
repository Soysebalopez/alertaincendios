/**
 * Telegram Bot API helpers.
 */

/** Timeout for every Telegram API call (ms). Bounds the alert-fan-out crons. */
const TELEGRAM_TIMEOUT_MS = 8000;

/**
 * Outcome of a Telegram send. `sendMessage` never throws — it returns this so
 * callers can decide what to do without try/catch. `ok` is true only on a 2xx
 * from Telegram; `blocked` flags the case where the user blocked/deactivated the
 * bot (HTTP 403 or a matching description), so callers can stop targeting them.
 */
export type SendResult = {
  ok: boolean;
  status: number;
  blocked: boolean;
  description?: string;
};

/**
 * Escapes the five characters that break Telegram's HTML parse_mode. MUST be
 * applied to any externally-sourced string (city names from geocoding, cuartel
 * names, zone names) before interpolating it into an HTML message — an unescaped
 * `&`/`<`/`>` makes Telegram reject the message with HTTP 400 and the alert is
 * lost.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function callTelegram(
  method: string,
  payload: Record<string, unknown>
): Promise<SendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, blocked: false, description: "no token" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });

    if (res.ok) return { ok: true, status: res.status, blocked: false };

    // Non-2xx: read the description so callers can log it / detect blocks.
    let description: string | undefined;
    try {
      const body = (await res.json()) as { description?: string };
      description = body?.description;
    } catch {
      /* body not JSON — leave description undefined */
    }
    const desc = (description ?? "").toLowerCase();
    const blocked =
      res.status === 403 ||
      desc.includes("blocked") ||
      desc.includes("deactivated") ||
      desc.includes("chat not found");
    return { ok: false, status: res.status, blocked, description };
  } catch (err) {
    // Network error / timeout — never throw, surface as a failed result.
    return {
      ok: false,
      status: 0,
      blocked: false,
      description: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<SendResult> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

/**
 * Edita un mensaje ya enviado (texto + reply_markup). Se usa para actualizar un
 * menú inline en su lugar en vez de apilar un mensaje nuevo en cada toque.
 */
export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<SendResult> {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

export type BotCommand = { command: string; description: string };

/**
 * Registra el menú nativo del bot (lo que Telegram muestra al tocar "/").
 * Este menú NO se deriva del webhook: hay que pushearlo explícitamente con
 * setMyCommands. Se invoca desde /api/bot/sync-commands.
 */
export async function setMyCommands(
  commands: BotCommand[],
  scope?: { type: string },
  languageCode?: string
): Promise<boolean> {
  const result = await callTelegram("setMyCommands", {
    commands,
    ...(scope ? { scope } : {}),
    ...(languageCode ? { language_code: languageCode } : {}),
  });
  return result.ok;
}

/**
 * Responde un callback_query (saca el spinner del botón). `text` muestra un toast
 * efímero (showAlert=true → popup modal). Best-effort.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<SendResult> {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    show_alert: showAlert,
  });
}
