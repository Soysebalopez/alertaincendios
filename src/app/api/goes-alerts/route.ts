import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import { sendMessage } from "@/lib/telegram";

/**
 * GET /api/goes-alerts
 *
 * Triggered by Supabase pg_cron a few minutes after /api/goes-sync ran. Sends
 * "POSIBLE foco (preliminar)" Telegram alerts to subscribers within 100 km of
 * any new high-confidence GOES-19 detection that hasn't been alerted yet.
 *
 * Dedup is per (goes_id, chat_id) via the goes_alerted table.
 *
 * The "confirmed" upgrade message is NOT sent here — /api/alerts (FIRMS path)
 * handles that when a new FIRMS fire matches a recent preliminary.
 */
const LOOKBACK_MINUTES = 30;
const RADIUS_KM = 100;
// WHI-584 — single-frame detections (seen_in_scans = 1) are riskier (could be
// glint or transient noise). Require a higher FRP threshold to alert on them.
// Multi-frame detections (>= 2) get alerted regardless of FRP.
const SINGLE_FRAME_FRP_THRESHOLD_MW = 10;

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
    const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();

    const { data: detections, error: detErr } = await db
      .from("goes_preliminary")
      .select(
        "id, lat, lng, mask, mask_label, frp_mw, scan_start, detected_at, seen_in_scans"
      )
      .eq("high_confidence", true)
      .gte("detected_at", cutoff)
      .order("detected_at", { ascending: false });

    if (detErr) {
      console.error("goes-alerts read goes_preliminary failed:", detErr);
      return NextResponse.json({ error: "db_read_failed" }, { status: 500 });
    }

    if (!detections || detections.length === 0) {
      return NextResponse.json({ processed: 0, alerts: 0, reason: "no_recent_detections" });
    }

    const { data: subscribers } = await db
      .from("subscribers")
      .select("chat_id, lat, lng, city_name, role, cuartel_name");

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ processed: detections.length, alerts: 0, reason: "no_subscribers" });
    }

    let alertsSent = 0;
    let skippedLowFrpSingleFrame = 0;

    for (const det of detections) {
      // WHI-584 — gating: single-frame low-FRP detections are too noisy to
      // alert on. Require >= 2 scans OR FRP > 10 MW.
      const seenInScans = (det as { seen_in_scans?: number }).seen_in_scans ?? 1;
      const frp = det.frp_mw ?? 0;
      if (seenInScans < 2 && frp < SINGLE_FRAME_FRP_THRESHOLD_MW) {
        skippedLowFrpSingleFrame++;
        continue;
      }
      for (const sub of subscribers) {
        // Skip if already alerted (per goes_id, chat_id)
        const { data: existing } = await db
          .from("goes_alerted")
          .select("id")
          .eq("goes_id", det.id)
          .eq("chat_id", sub.chat_id)
          .limit(1);
        if (existing && existing.length > 0) continue;

        const distKm = haversineKm(sub.lat, sub.lng, det.lat, det.lng);
        if (distKm > RADIUS_KM) continue;

        // WHI-588 — fireman role gets operational format
        const isFireman = (sub as { role?: string }).role === "fireman";
        const cuartel = (sub as { cuartel_name?: string }).cuartel_name ?? null;
        const message = isFireman
          ? formatFiremanPreliminary(det, sub.city_name, distKm, cuartel)
          : formatPreliminary(det, sub.city_name, distKm);
        await sendMessage(sub.chat_id, message);

        await db.from("goes_alerted").insert({
          goes_id: det.id,
          chat_id: sub.chat_id,
        });

        alertsSent++;
      }
    }

    return NextResponse.json({
      processed: detections.length,
      subscribers: subscribers.length,
      alerts: alertsSent,
      skippedLowFrpSingleFrame,
    });
  } catch (error) {
    console.error("goes-alerts error:", error);
    return NextResponse.json({ error: "goes_alerts_failed" }, { status: 500 });
  }
}

function minutesSince(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

// WHI-588 — operational preliminary alert for fireman role
function formatFiremanPreliminary(
  det: {
    lat: number;
    lng: number;
    mask: number;
    mask_label: string | null;
    frp_mw: number | null;
    scan_start: string;
  },
  cityName: string,
  distKm: number,
  cuartelName: string | null
): string {
  const dist = Math.round(distKm * 10) / 10;
  const ageMin = minutesSince(det.scan_start);
  const gMaps = `https://www.google.com/maps?q=${det.lat},${det.lng}&z=12`;
  const frp = det.frp_mw != null ? `${det.frp_mw.toFixed(1)} MW` : "—";

  return (
    `⚠️ <b>Posible foco a ${dist}km — esperando confirmación</b>\n\n` +
    `📍 ${dist} km (desde ${cityName})\n` +
    `🔥 FRP estimado: ${frp}\n` +
    `🛰️ NOAA GOES-19 · detección hace ~${ageMin} min\n` +
    `🧭 Coords: <code>${det.lat.toFixed(4)}, ${det.lng.toFixed(4)}</code>\n` +
    `📌 <a href="${gMaps}">Maps</a>\n\n` +
    `<i>Preliminar — NASA FIRMS confirma en 1-3 h. Validá visualmente antes de despachar.</i>` +
    `\n—\nC.L.A.R.A. · Coordinación interna${cuartelName ? ` · ${cuartelName}` : ""}`
  );
}

function formatPreliminary(
  det: {
    lat: number;
    lng: number;
    mask: number;
    mask_label: string | null;
    frp_mw: number | null;
    scan_start: string;
  },
  cityName: string,
  distKm: number
): string {
  const dist = Math.round(distKm * 10) / 10;
  const ageMin = minutesSince(det.scan_start);
  const gMaps = `https://www.google.com/maps?q=${det.lat},${det.lng}&z=12`;
  const frp = det.frp_mw != null ? `${det.frp_mw.toFixed(1)} MW` : "—";

  // WHI-585 — header surfaces distance in Telegram's preview line
  return (
    `⚠️ <b>Posible foco a ${dist}km de ${cityName}</b>\n\n` +
    `📍 A <b>${dist} km</b> de ${cityName}\n` +
    `🛰️ Fuente: NOAA GOES-19 — escaneo cada 10 min\n` +
    `⏱️ Detectado hace ~${ageMin} min\n` +
    `🔥 Potencia estimada: ${frp}\n\n` +
    `<i>Esta detección viene de un satélite geoestacionario y es rápida, ` +
    `pero menos precisa. NASA FIRMS suele confirmar en 1-3 horas. ` +
    `Si vas a tomar acción, validá visualmente o esperá la confirmación.</i>\n\n` +
    `📌 <a href="${gMaps}">Ver en Google Maps</a>\n\n` +
    `—\nCentral de Localizacion y Alerta de Riesgo Ambiental (C.L.A.R.A.)\n` +
    `<i>Datos: NOAA GOES-19 ABI-L2-FDCF</i>`
  );
}
