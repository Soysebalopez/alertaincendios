import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { setMyCommands, type BotCommand } from "@/lib/telegram";

/**
 * GET /api/bot/sync-commands?secret=<CRON_SECRET>
 *
 * Registra el menú nativo del bot (lo que Telegram muestra al tocar "/").
 * Ese menú se setea con setMyCommands y NO se deriva del webhook — por eso
 * antes /soybombero y /dejarcuartel no aparecían aunque el código los manejara.
 *
 * Re-ejecutable: pegá esta URL (con el secret) cada vez que cambie la lista.
 * /start lo agrega Telegram automáticamente, no hace falta listarlo.
 */
const COMMANDS: BotCommand[] = [
  { command: "ciudad", description: "Suscribirte por nombre de ciudad" },
  { command: "estado", description: "Focos activos cerca tuyo" },
  { command: "rayos", description: "Alertas de tormenta seca on/off" },
  { command: "soybombero", description: "Modo bombero (para cuarteles)" },
  { command: "dejarcuartel", description: "Volver a alertas de vecino" },
  { command: "about", description: "Sobre el proyecto" },
  { command: "help", description: "Lista de comandos" },
  { command: "cancelar", description: "Eliminar suscripción" },
];

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ok = await setMyCommands(COMMANDS);
  return NextResponse.json({ ok, count: COMMANDS.length });
}
