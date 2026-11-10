import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendResult } from "./telegram";

/**
 * Si un envío de Telegram falló porque el usuario BLOQUEÓ el bot (403), marca al
 * suscriptor como bloqueado (`blocked_at = now()`) y devuelve `true`; a partir del
 * próximo ciclo los crons lo saltean (filtran `blocked_at IS NULL`), así el bot
 * deja de reintentarle y ese "error" esperable deja de ir a Sentry.
 *
 * Para cualquier OTRO fallo (400/429/timeout/…) devuelve `false`: ahí sí el caller
 * lo loguea como error real.
 *
 * El `.is("blocked_at", null)` evita pisar la fecha original si ya estaba marcado.
 */
export async function markBlockedIfNeeded(
  db: SupabaseClient,
  chatId: number,
  sendResult: Pick<SendResult, "blocked">,
): Promise<boolean> {
  if (!sendResult.blocked) return false;
  await db
    .from("subscribers")
    .update({ blocked_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .is("blocked_at", null);
  return true;
}
