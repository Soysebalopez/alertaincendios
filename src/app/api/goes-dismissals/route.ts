import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";

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
  const secret = new URL(request.url).searchParams.get("secret");
  const bearerToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const isAuthorized =
    secret === process.env.CRON_SECRET || bearerToken === process.env.CRON_SECRET;

  if (!isAuthorized) {
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
      .select("id, chat_id, preliminary_sent_at")
      .is("confirmed_sent_at", null)
      .is("dismissed_at", null)
      .lt("preliminary_sent_at", upperBound)
      .gt("preliminary_sent_at", lowerBound);

    if (error) {
      console.error("goes-dismissals read failed:", error);
      return NextResponse.json({ error: "db_read_failed" }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({ pending: 0, sent: 0, reason: "no_dismissals_due" });
    }

    let sent = 0;
    for (const row of pending) {
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
        `\n—\nCLARA · Cobertura GOES-19 + NASA FIRMS`;

      try {
        await sendMessage(row.chat_id, message);
        await db
          .from("goes_alerted")
          .update({ dismissed_at: new Date().toISOString() })
          .eq("id", row.id);
        sent++;
      } catch (e) {
        console.error("dismissal send failed for goes_alerted", row.id, e);
      }
    }

    return NextResponse.json({ pending: pending.length, sent });
  } catch (error) {
    console.error("goes-dismissals error:", error);
    return NextResponse.json({ error: "goes_dismissals_failed" }, { status: 500 });
  }
}
