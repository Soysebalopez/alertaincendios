import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";

/**
 * GET /api/goes-dismissals
 *
 * WHI-584 — Runs once a day (pg_cron) and notifies subscribers that a
 * preliminary GOES alert they received >4 h ago was never confirmed by
 * FIRMS. Sends a "✅ Falsa alarma" message and marks the row as
 * dismissed so we don't notify twice.
 *
 * Window: preliminary_sent_at older than 4 h but newer than 7 days
 * (anything older has already been pruned or is stale).
 */
const DISMISSAL_AFTER_HOURS = 4;
const DISMISSAL_MAX_AGE_DAYS = 7;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabase();
    const now = Date.now();
    const upperBound = new Date(now - DISMISSAL_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    const lowerBound = new Date(
      now - DISMISSAL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: pending, error } = await db
      .from("goes_alerted")
      .select("id, chat_id, goes_id, preliminary_sent_at")
      .is("confirmed_sent_at", null)
      .is("dismissed_at", null)
      .lt("preliminary_sent_at", upperBound)
      .gt("preliminary_sent_at", lowerBound);

    if (error) {
      console.error("goes-dismissals read failed:", error);
      return NextResponse.json({ error: "db_read_failed" }, { status: 500 });
    }

    // P1-3 fix: NO cortar acá cuando no hay dismissals pendientes. La purga de
    // huérfanos (más abajo) tiene que correr SIEMPRE, también con goes_alerted
    // vacía (temporada baja). El early-return previo dejaba las preliminares
    // huérfanas sin limpiar hasta goes-prune (7 días) → ~571 acumuladas.
    let sent = 0;
    const goesIdsToDelete = new Set<number>();

    for (const row of pending ?? []) {
      const sentMinutesAgo = Math.max(
        0,
        Math.round((now - Date.parse(row.preliminary_sent_at)) / 60000)
      );
      const hoursAgo = (sentMinutesAgo / 60).toFixed(1);
      const message =
        `✅ <b>Falsa alarma anterior</b>\n\n` +
        `La posible alerta de hace ${hoursAgo} h no fue confirmada por NASA. ` +
        `Probablemente fue ruido térmico (reflejo solar, calentamiento de superficie, ` +
        `o una detección que el satélite no volvió a captar).\n\n` +
        `<i>Seguimos monitoreando. Si vuelve a aparecer, te aviso.</i>` +
        `\n—\nClara · AlertaForestal.org · GOES-19 + NASA FIRMS`;

      try {
        await sendMessage(row.chat_id, message);
        const goesId = (row as { goes_id?: number }).goes_id;
        if (goesId != null) goesIdsToDelete.add(goesId);
        sent++;
      } catch (e) {
        console.error("dismissal send failed for goes_alerted", row.id, e);
      }
    }

    // WHI-584 follow-up — purge dismissed goes_preliminary rows.
    // Cascade FK on goes_alerted removes the alert rows too. The Telegram
    // message was already sent above, so we don't lose user-facing audit.
    let purgedDismissed = 0;
    if (goesIdsToDelete.size > 0) {
      const ids = Array.from(goesIdsToDelete);
      const { error: delErr, count } = await db
        .from("goes_preliminary")
        .delete({ count: "exact" })
        .in("id", ids);
      if (!delErr) purgedDismissed = count ?? ids.length;
    }

    // WHI-584 follow-up — also purge "orphan" preliminaries: rows older than
    // dismissalWindow without any goes_alerted ever (no subscriber was within
    // 100km, so the prelim never alerted anyone — keeping it is just clutter).
    // Purga iterativa: PostgREST limita cada SELECT a max-rows (~1000). Sin
    // iterar, un backlog >1000 (temporada alta) se truncaría EN SILENCIO y
    // quedaría sin limpiar hasta goes-prune (7d). Iteramos hasta vaciar.
    const orphanCutoff = new Date(now - DISMISSAL_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    let purgedOrphans = 0;
    for (let iter = 0; iter < 12; iter++) {
      const { data: orphans } = await db
        .from("goes_preliminary")
        .select("id, goes_alerted(id)")
        .lt("detected_at", orphanCutoff)
        .limit(1000);
      if (!orphans || orphans.length === 0) break;
      const orphanIds = orphans
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => !r.goes_alerted || r.goes_alerted.length === 0)
        .map((r: { id: number }) => r.id);
      // Si esta tanda no trajo huérfanos, las filas restantes ya alertaron:
      // no hay más que borrar por esta vía. Corta para no loopear infinito.
      if (orphanIds.length === 0) break;
      const { count } = await db
        .from("goes_preliminary")
        .delete({ count: "exact" })
        .in("id", orphanIds);
      purgedOrphans += count ?? orphanIds.length;
      if (orphans.length < 1000) break;
    }

    return NextResponse.json({
      pending: pending?.length ?? 0,
      sent,
      purgedDismissed,
      purgedOrphans,
    });
  } catch (error) {
    console.error("goes-dismissals error:", error);
    return NextResponse.json({ error: "goes_dismissals_failed" }, { status: 500 });
  }
}
