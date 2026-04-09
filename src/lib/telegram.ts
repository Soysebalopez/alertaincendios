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
