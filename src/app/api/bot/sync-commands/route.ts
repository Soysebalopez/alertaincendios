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
  { command: "start", description: "Empezar y suscribirte" },
  { command: "ciudad", description: "Suscribirte por ciudad (ej: /ciudad Bariloche)" },
  { command: "estado", description: "Focos activos en 100 km a tu alrededor" },
  { command: "rayos", description: "Activar/desactivar alertas de tormenta seca" },
  { command: "preferencias", description: "Ajustar tus avisos (rayos y prevención)" },
  { command: "prevencion", description: "Avisos de prevención de incendio" },
  { command: "soybombero", description: "Modo bombero (para cuarteles)" },
  { command: "dejarcuartel", description: "Volver a alertas de vecino" },
  { command: "about", description: "Sobre el proyecto" },
  { command: "help", description: "Ver lista de comandos" },
  { command: "cancelar", description: "Eliminar tu suscripción" },
];

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Telegram resuelve el menú por SCOPE (el más específico gana). Un set previo
  // en all_private_chats sombreaba el scope default (por eso /soybombero no
  // aparecía). Seteamos los 3 scopes que ganan para un usuario es en un DM:
  // default, all_private_chats, y all_private_chats+es.
  const PRIVATE = { type: "all_private_chats" };
  const def = await setMyCommands(COMMANDS);
  const dm = await setMyCommands(COMMANDS, PRIVATE);
  const dmEs = await setMyCommands(COMMANDS, PRIVATE, "es");
  return NextResponse.json({
    ok: def && dm && dmEs,
    count: COMMANDS.length,
    scopes: { default: def, all_private_chats: dm, all_private_chats_es: dmEs },
  });
}
