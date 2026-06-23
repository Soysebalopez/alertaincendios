import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendMessage } from "@/lib/telegram";
import { findDangerZone, type DangerZoneBox } from "@/lib/danger-zone-match";
import { evaluatePreventionTrigger, type ForecastDay } from "@/lib/prevention-trigger";
import { formatPreventionAlert, formatDailyBriefing } from "@/lib/prevention-messages";
import { PREVENTION_PROVINCE_IDS, type DangerClass } from "@/lib/fire-danger";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

function artToday(): string {
  // Argentina is UTC-3, no DST. Shift now by -3h and take the date.
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabase();
    const today = artToday();

    // 1. covered zones (M1: all danger_zones in prevention provinces)
    const { data: zoneData } = await db
      .from("danger_zones")
      .select("id,name,bbox,province")
      .in("province", PREVENTION_PROVINCE_IDS);
    const zones = (zoneData ?? []) as (DangerZoneBox & { province: string })[];
    if (zones.length === 0) return NextResponse.json({ alerts: 0, briefings: 0, reason: "no_zones" });
    const zoneIds = zones.map((z) => z.id);

    // 2. latest forecast per zone
    const { data: latest } = await db
      .from("fire_danger")
      .select("computed_at")
      .in("zone_id", zoneIds)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const computedAt = (latest as { computed_at: string } | null)?.computed_at;
    if (!computedAt) return NextResponse.json({ alerts: 0, briefings: 0, reason: "no_forecast" });

    const { data: rows } = await db
      .from("fire_danger")
      .select("zone_id,target_date,danger_class")
      .in("zone_id", zoneIds)
      .eq("computed_at", computedAt)
      .order("target_date", { ascending: true });
    const byZone = new Map<string, ForecastDay[]>();
    for (const r of (rows ?? []) as { zone_id: string; target_date: string; danger_class: DangerClass }[]) {
      if (!byZone.has(r.zone_id)) byZone.set(r.zone_id, []);
      byZone.get(r.zone_id)!.push({ target_date: r.target_date, danger_class: r.danger_class });
    }

    // 3. opted-in subs
    const { data: subData } = await db
      .from("subscribers")
      .select("chat_id, lat, lng, prevention_mode")
      .in("prevention_mode", ["alerts", "daily"]);
    const subs = (subData ?? []) as { chat_id: number; lat: number; lng: number; prevention_mode: "alerts" | "daily" }[];

    let alerts = 0;
    let briefings = 0;

    for (const sub of subs) {
      try {
        const zone = findDangerZone(sub.lat, sub.lng, zones);
        if (!zone) continue;
        const forecast = byZone.get(zone.id);
        if (!forecast || forecast.length === 0) continue;

        if (sub.prevention_mode === "alerts") {
          const { data: prevRow } = await db
            .from("prevention_alerted")
            .select("alerted_class")
            .eq("zone_id", zone.id)
            .eq("chat_id", sub.chat_id)
            .maybeSingle();
          const alertedClass = (prevRow as { alerted_class: DangerClass } | null)?.alerted_class ?? null;

          const decision = evaluatePreventionTrigger(forecast, today, alertedClass);

          if (decision.action === "clear") {
            await db.from("prevention_alerted").delete().eq("zone_id", zone.id).eq("chat_id", sub.chat_id);
            continue;
          }
          if (decision.action === "none") continue;

          const message = formatPreventionAlert(
            zone.name,
            decision.peak,
            decision.peakDate,
            decision.action === "escalate" ? decision.from : null
          );
          await sendMessage(sub.chat_id, message);
          // mark AFTER a successful send (prioritise not-losing a hazard alert)
          await db.from("prevention_alerted").upsert({
            zone_id: zone.id,
            chat_id: sub.chat_id,
            alerted_class: decision.peak,
            alerted_at: new Date().toISOString(),
          });
          alerts++;
        } else {
          // daily: idempotency claim BEFORE sending (prioritise not-duplicating)
          const { error: claimErr } = await db
            .from("prevention_briefing_sent")
            .insert({ chat_id: sub.chat_id, sent_date: today })
            .select("chat_id")
            .single();
          if (claimErr) continue; // 23505 = already sent today
          const message = formatDailyBriefing(zone.name, today, forecast);
          await sendMessage(sub.chat_id, message);
          briefings++;
        }
      } catch (e) {
        log.error({ event: "prevention_alerts.sub_failed", chatId: sub.chat_id, err: e instanceof Error ? e.message : String(e) });
        continue;
      }
    }

    return NextResponse.json({ subscribers: subs.length, alerts, briefings, computedAt });
  } catch (error) {
    log.error({
      event: "prevention_alerts.cron_failed",
      err: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
