/**
 * Telegram Bot API helpers.
 */

export async function sendMessage(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra,
    }),
  });
}

export type BotCommand = { command: string; description: string };

/**
 * Registra el menú nativo del bot (lo que Telegram muestra al tocar "/").
 * Este menú NO se deriva del webhook: hay que pushearlo explícitamente con
 * setMyCommands. Se invoca desde /api/bot/sync-commands.
 */
export async function setMyCommands(commands: BotCommand[]): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setMyCommands`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    }
  );
  return res.ok;
}

/**
 * Responde un callback_query (saca el spinner del botón). `text` muestra un toast
 * efímero (showAlert=true → popup modal). Best-effort, mismo patrón que sendMessage.
 */
export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
      show_alert: showAlert,
    }),
  });
}
