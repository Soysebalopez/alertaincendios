import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

/**
 * POST /api/cuarteles/request
 *
 * Recibe la solicitud de alta de un cuartel de bomberos voluntarios desde el
 * form de /cuarteles y la manda por email al owner vía Resend. Es la "Opción A"
 * del FIREMAN-ONBOARDING-PLAN: contacto manual para validar demanda, sin
 * auto-emisión de códigos todavía.
 */

const OWNER_EMAIL = "soysebalopez@gmail.com";
// onboarding@resend.dev: remitente compartido de Resend, sirve para mandar al
// mail de la propia cuenta sin verificar el dominio alertaforestal.org todavía.
const FROM = "AlertaForestal <onboarding@resend.dev>";

// Form humano: un alta de cuartel es un evento raro. 5/min/IP corta abuso sin
// molestar a nadie real.
const RATE_LIMIT_PER_MIN = 5;
const MAX_LEN = 2000;

interface CuartelRequestBody {
  cuartel?: string;
  provincia?: string;
  localidad?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  mensaje?: string;
  // Honeypot: campo oculto que un humano nunca completa.
  website?: string;
}

// Resend lazy init — NUNCA en module scope (Vercel evalúa las rutas en build y
// no hay env vars ahí). Mismo criterio que getSupabase().
let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_LEN) : "";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: NextRequest) {
  let body: CuartelRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot: si viene lleno, es un bot. Respondemos ok sin enviar nada para no
  // darle señal de que lo detectamos.
  if (clean(body.website)) {
    return NextResponse.json({ ok: true });
  }

  // B6 — rate-limit ANTES de validar, para que un atacante no pueda martillar el
  // endpoint con bodies inválidos sin tocar el limiter.
  const rl = await checkRateLimit({
    key: clientIp(request),
    limit: RATE_LIMIT_PER_MIN,
    windowSec: 60,
    namespace: "cuarteles-request",
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const cuartel = clean(body.cuartel);
  const provincia = clean(body.provincia);
  const localidad = clean(body.localidad);
  const contacto = clean(body.contacto);
  const telefono = clean(body.telefono);
  const email = clean(body.email);
  const mensaje = clean(body.mensaje);

  if (!cuartel || !provincia || !localidad || !contacto || !telefono) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const resend = getResend();
  if (!resend) {
    console.error("[cuarteles/request] RESEND_API_KEY no configurada");
    return NextResponse.json({ error: "email_unavailable" }, { status: 500 });
  }

  const rows: [string, string][] = [
    ["Cuartel", cuartel],
    ["Provincia", provincia],
    ["Localidad", localidad],
    ["Contacto", contacto],
    ["Teléfono / WhatsApp", telefono],
    ["Email", email || "—"],
    ["Mensaje", mensaje || "—"],
  ];

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  const html = `<h2>🚒 Nuevo cuartel quiere sumarse</h2><table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="color:#888;vertical-align:top"><strong>${esc(
          k,
        )}</strong></td><td>${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("")}</table>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: OWNER_EMAIL,
      replyTo: email || undefined,
      subject: `🚒 Nuevo cuartel: ${cuartel} (${provincia})`,
      text,
      html,
    });
    if (error) {
      console.error("[cuarteles/request] Resend error:", error);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
  } catch (err) {
    console.error("[cuarteles/request] excepción al enviar:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
