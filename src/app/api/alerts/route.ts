import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { fetchFires, FirePoint } from "@/lib/firms";
import { fetchWind, degreesToCardinal } from "@/lib/wind";
import { haversineKm, isUpwind, smokeEtaMinutes } from "@/lib/geo";
import { sendMessage } from "@/lib/telegram";

/**
 * GET /api/alerts
 *
 * Cron endpoint — called by Vercel Cron or manually with ?secret=...
 * 1. Reads cached fires from Supabase
 * 2. For each fire, evaluates all subscribers (dispersion model)
 * 3. Sends Telegram alerts to affected subscribers
 * 4. Deduplicates via ai_alerted_fires table
 */
export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  const bearerToken = request.headers.get("authorization")?.replace("Bearer ", "");
  const isAuthorized =
    secret === process.env.CRON_SECRET || bearerToken === process.env.CRON_SECRET;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allFires = await fetchFires();
    // Exclude industrial flaring (type 2) and offshore (type 3) from alerts
    const fires = allFires.filter((f) => (f.type ?? 0) === 0 || f.type === 1);
    if (fires.length === 0) {
      return NextResponse.json({ processed: 0, alerts: 0, filtered: allFires.length - fires.length });
    }

    const db = getSupabase();

    // Get all subscribers
    const { data: subscribers } = await db
      .from("subscribers")
      .select("chat_id, lat, lng, city_name, role, cuartel_name");

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ processed: fires.length, alerts: 0, reason: "no subscribers" });
    }

    let alertsSent = 0;
    let confirmations = 0;

    for (const fire of fires) {
      const fireKey = buildFireKey(fire);

      for (const sub of subscribers) {
        // Check if already alerted
        const { data: existing } = await db
          .from("ai_alerted_fires")
          .select("fire_key")
          .eq("fire_key", fireKey)
          .eq("chat_id", sub.chat_id)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const distKm = haversineKm(sub.lat, sub.lng, fire.latitude, fire.longitude);
        if (distKm > 100) continue; // Skip fires > 100km away

        // Get wind at fire location
        const wind = await fetchWind(fire.latitude, fire.longitude);
        const upwind = isUpwind(sub.lat, sub.lng, fire.latitude, fire.longitude, wind.windDirection);
        const eta = smokeEtaMinutes(distKm, wind.windSpeed, upwind.isUpwind);

        const level = classifyAlert(distKm, upwind.isUpwind);
        if (level === "none") continue;

        // WHI-547 — does this FIRMS fire confirm a recent GOES preliminary
        // alert we already sent to this subscriber?
        const match = await findPendingPreliminary(db, sub.chat_id, fire);

        // WHI-588 — fireman role gets an operational message format, not the
        // citizen-facing alert. Same data path, different tone + structure.
        const isFireman = (sub as { role?: string }).role === "fireman";
        const cuartel = (sub as { cuartel_name?: string }).cuartel_name ?? null;
        const message = isFireman
          ? formatFiremanAlert(fire, sub, distKm, eta, level, cuartel, match != null)
          : match
            ? await formatConfirmedFromPreliminary(fire, sub, distKm, eta, level, match.preliminary_sent_at)
            : await formatAlert(fire, sub, distKm, eta, level);

        await sendMessage(sub.chat_id, message);

        if (match) {
          await db
            .from("goes_alerted")
            .update({ confirmed_sent_at: new Date().toISOString(), firms_fire_key: fireKey })
            .eq("id", match.id);
          confirmations++;
        }

        // Record to avoid duplicate alerts on the FIRMS side too
        await db.from("ai_alerted_fires").insert({
          fire_key: fireKey,
          chat_id: sub.chat_id,
          alerted_at: new Date().toISOString(),
        });

        alertsSent++;
      }
    }

    return NextResponse.json({
      processed: fires.length,
      subscribers: subscribers.length,
      alerts: alertsSent,
      confirmations,
    });
  } catch (error) {
    console.error("Alerts cron error:", error);
    return NextResponse.json({ error: "Alert processing failed" }, { status: 500 });
  }
}

function buildFireKey(fire: FirePoint): string {
  return `${fire.latitude.toFixed(3)}_${fire.longitude.toFixed(3)}_${fire.acqDate}`;
}

function classifyAlert(
  distKm: number,
  upwind: boolean
): "danger" | "warning" | "info" | "none" {
  if (distKm < 20 && upwind) return "danger";
  if (distKm < 50 && upwind) return "warning";
  if (distKm < 50) return "info";
  return "none";
}

function frpLabel(frp: number): string {
  if (frp < 1) return "Muy baja (posible flaring industrial)";
  if (frp < 5) return "Baja (quema agricola o foco menor)";
  if (frp < 20) return "Moderada (incendio activo)";
  if (frp < 50) return "Alta (incendio forestal significativo)";
  return "Muy alta (incendio de gran magnitud)";
}

function frpBars(frp: number): string {
  const level =
    frp < 1 ? 1 : frp < 5 ? 2 : frp < 20 ? 3 : frp < 50 ? 4 : 5;
  return "🟧".repeat(level) + "⬛".repeat(5 - level);
}

// Compass bearing from user to fire (degrees, 0=N).
function bearingDegrees(
  userLat: number,
  userLng: number,
  fireLat: number,
  fireLng: number
): number {
  const φ1 = (userLat * Math.PI) / 180;
  const φ2 = (fireLat * Math.PI) / 180;
  const Δλ = ((fireLng - userLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// Minutes elapsed since FIRMS detection (acqDate is YYYY-MM-DD, acqTime is HHMM UTC).
function minutesSinceDetection(acqDate: string, acqTime: string): number {
  if (!acqDate || !acqTime) return 0;
  const padded = acqTime.padStart(4, "0");
  const hh = padded.slice(0, 2);
  const mm = padded.slice(2, 4);
  const ts = Date.parse(`${acqDate}T${hh}:${mm}:00Z`);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

async function formatAlert(
  fire: FirePoint,
  sub: { lat: number; lng: number; city_name: string },
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info"
): Promise<string> {
  const dist = Math.round(distKm * 10) / 10;
  const emoji = level === "danger" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
  const gMapsUrl = `https://www.google.com/maps?q=${fire.latitude},${fire.longitude}&z=12`;
  const cardinal = degreesToCardinal(
    bearingDegrees(sub.lat, sub.lng, fire.latitude, fire.longitude)
  );
  const ageMin = minutesSinceDetection(fire.acqDate, fire.acqTime);
  const windToward = etaMinutes > 0;

  const interpretation = await interpretFire(
    fire,
    sub.city_name,
    dist,
    etaMinutes,
    level
  );

  // WHI-585 — header with immediate value so Telegram notification preview is actionable
  const headerLine = headerFor(level, dist, etaMinutes, windToward);
  let msg = `${emoji} <b>${headerLine}</b>\n\n`;
  msg += `📍 A <b>${dist} km</b> de ${sub.city_name}\n`;
  msg += `🧭 Dirección: ${cardinal}\n`;
  msg += `💨 Viento: ${windToward ? "<b>hacia tu posición</b>" : "fuera de tu posición"}`;
  if (windToward) msg += ` (ETA humo ~${etaMinutes} min)`;
  msg += `\n`;
  msg += `${frpBars(fire.frp)} ${fire.frp} MW — ${frpLabel(fire.frp).split(" (")[0]}\n`;
  msg += `🛰️ Fuente: NASA FIRMS\n`;
  msg += `⏱️ Detectado hace ${ageMin} min\n`;

  if (interpretation) {
    msg += `\n<i>${interpretation}</i>\n`;
  }

  msg += `\n📌 <a href="${gMapsUrl}">Ver en Google Maps</a>`;
  msg += `\n\n—\nCentral de Localizacion y Alerta de Riesgo Ambiental (CLARA)`;
  msg += `\n<i>Datos: NASA FIRMS VIIRS · Open-Meteo</i>`;

  return msg;
}

// WHI-585 — build the alert header line. Telegram's notification preview
// shows the first line only, so we surface the actionable bit (distance,
// smoke ETA) instead of a generic "ALERTA".
function headerFor(
  level: "danger" | "warning" | "info",
  dist: number,
  etaMinutes: number,
  windToward: boolean
): string {
  if (level === "danger" && windToward) {
    return `Foco a ${dist}km — humo en ~${etaMinutes} min`;
  }
  if (level === "danger") {
    return `Foco activo a ${dist}km — viento favorable`;
  }
  if (level === "warning") {
    return `Foco a ${dist}km — atención`;
  }
  return `Foco detectado a ${dist}km`;
}

async function interpretFire(
  fire: FirePoint,
  cityName: string,
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info"
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Sos CLARA, un sistema de alerta de incendios. Interpreta este foco de calor en 2-3 oraciones breves para un ciudadano argentino. Considera la potencia (FRP), distancia, y si el viento lo afecta. Si el FRP es bajo (<5 MW) en zona petrolera de Neuquen/Mendoza, menciona que puede ser flaring. Si es alto, se directo sobre el riesgo. No uses markdown ni emojis. IMPORTANTE — cuando te refieras a vos misma: usa siempre 'CLARA' (o 'Central de Localizacion y Alerta de Riesgo Ambiental'). PROHIBIDO usar pronombres ('ella', 'el') o sinonimos ('el sistema', 'la plataforma', 'el servicio', 'la herramienta', 'el bot', 'la app'). Si la frase queda repetitiva, reescribila con sujeto elidido (ej: 'Detecta...' en vez de 'Ella detecta...').",
          },
          {
            role: "user",
            content: `Foco: ${fire.frp} MW, ${distKm} km de ${cityName}, confianza ${fire.confidence}, coordenadas ${fire.latitude},${fire.longitude}. Nivel: ${level}. ${etaMinutes > 0 ? `ETA humo: ${etaMinutes} min.` : "Viento no dirige humo hacia la zona."}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return "";
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

// WHI-547 — confirmation matching: did this FIRMS fire validate a recent
// preliminary GOES alert we already sent to the same subscriber?
type PendingPreliminary = {
  id: number;
  preliminary_sent_at: string;
};

async function findPendingPreliminary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  chatId: number,
  fire: FirePoint
): Promise<PendingPreliminary | null> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await db
    .from("goes_alerted")
    .select(
      "id, preliminary_sent_at, goes_preliminary!inner(lat, lng)"
    )
    .eq("chat_id", chatId)
    .is("confirmed_sent_at", null)
    .gte("preliminary_sent_at", twoHoursAgo);

  if (!rows || rows.length === 0) return null;

  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gp = (r as any).goes_preliminary;
    if (!gp) continue;
    const d = haversineKm(gp.lat, gp.lng, fire.latitude, fire.longitude);
    if (d <= 5) return { id: r.id, preliminary_sent_at: r.preliminary_sent_at };
  }
  return null;
}

// WHI-588 — operational alert for fireman role. Less interpretation, more data,
// clear coordination tone. Same for FIRMS-only detections and confirmation
// upgrades; the `wasPreliminary` flag adjusts the header only.
function formatFiremanAlert(
  fire: FirePoint,
  sub: { lat: number; lng: number; city_name: string },
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info",
  cuartelName: string | null,
  wasPreliminary: boolean
): string {
  const dist = Math.round(distKm * 10) / 10;
  const gMapsUrl = `https://www.google.com/maps?q=${fire.latitude},${fire.longitude}&z=12`;
  const cardinal = degreesToCardinal(
    bearingDegrees(sub.lat, sub.lng, fire.latitude, fire.longitude)
  );
  const ageMin = minutesSinceDetection(fire.acqDate, fire.acqTime);
  const windToward = etaMinutes > 0;

  const header = wasPreliminary
    ? `🚨 Foco CONFIRMADO a ${dist}km — coordinación`
    : `🚨 Foco a ${dist}km — coordinación`;

  let msg = `<b>${header}</b>\n\n`;
  msg += `📍 ${dist} km · ${cardinal} (desde ${sub.city_name})\n`;
  msg += `🔥 FRP ${fire.frp} MW · confianza ${fire.confidence}\n`;
  msg += `💨 Viento: ${windToward ? `<b>hacia el suscriptor</b> (ETA humo ~${etaMinutes} min)` : "fuera del suscriptor"}\n`;
  msg += `🛰️ ${wasPreliminary ? "GOES preliminar + " : ""}FIRMS VIIRS · detección hace ${ageMin} min\n`;
  msg += `🧭 Coords: <code>${fire.latitude.toFixed(4)}, ${fire.longitude.toFixed(4)}</code>\n`;
  msg += `📌 <a href="${gMapsUrl}">Maps</a>\n\n`;
  msg += `<i>Mensaje operativo — sin interpretación AI, datos crudos.</i>`;
  msg += `\n—\nCLARA · Coordinación interna${cuartelName ? ` · ${cuartelName}` : ""}`;
  return msg;
}

async function formatConfirmedFromPreliminary(
  fire: FirePoint,
  sub: { lat: number; lng: number; city_name: string },
  distKm: number,
  etaMinutes: number,
  level: "danger" | "warning" | "info",
  preliminarySentAt: string
): Promise<string> {
  const dist = Math.round(distKm * 10) / 10;
  const gMapsUrl = `https://www.google.com/maps?q=${fire.latitude},${fire.longitude}&z=12`;
  const cardinal = degreesToCardinal(
    bearingDegrees(sub.lat, sub.lng, fire.latitude, fire.longitude)
  );
  const ageMin = minutesSinceDetection(fire.acqDate, fire.acqTime);
  const sinceMin = Math.max(0, Math.round((Date.now() - Date.parse(preliminarySentAt)) / 60000));
  const windToward = etaMinutes > 0;

  // WHI-585 — header with immediate value
  const headerLine = windToward
    ? `Foco confirmado a ${dist}km — humo en ~${etaMinutes} min`
    : `Foco confirmado a ${dist}km de ${sub.city_name}`;
  let msg = `✅ <b>${headerLine}</b>\n\n`;
  msg += `📍 A <b>${dist} km</b> de ${sub.city_name}\n`;
  msg += `🧭 Dirección: ${cardinal}\n`;
  msg += `💨 Viento: ${windToward ? "<b>hacia tu posición</b>" : "fuera de tu posición"}`;
  if (windToward) msg += ` (ETA humo ~${etaMinutes} min)`;
  msg += `\n`;
  msg += `${frpBars(fire.frp)} ${fire.frp} MW — ${frpLabel(fire.frp).split(" (")[0]}\n`;
  msg += `🛰️ Validado por NASA FIRMS (VIIRS 375m)\n`;
  msg += `⏱️ Alerta preliminar hace ${sinceMin} min, confirmada ahora\n`;
  msg += `\n<i>El foco preliminar GOES que te avisamos antes acaba de ser ` +
    `confirmado por la pasada de VIIRS. La detección era real, no falsa alarma. ` +
    (level === "danger"
      ? `Riesgo alto por proximidad y viento — tomá precauciones.`
      : level === "warning"
        ? `Mantenete atento al avance del foco.`
        : `No hay riesgo inmediato pero seguimos monitoreando.`) +
    `</i>\n`;
  msg += `\n📌 <a href="${gMapsUrl}">Ver en Google Maps</a>`;
  msg += `\n\n—\nCLARA · Cobertura GOES-19 + NASA FIRMS`;

  return msg;
}
