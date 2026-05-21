/**
 * Logger estructurado mínimo. Emite JSON a stdout/stderr — Vercel los indexa
 * y permite `vercel logs <url> --json | jq '.level == "error"'`.
 *
 * No es una dependencia (pino, winston, etc) — son ~30 líneas que cubren el
 * 95% de los casos sin agregar bundle ni cold-start tax.
 *
 * Si `SENTRY_DSN` está seteado, los logs `error` también se reportan a Sentry
 * vía su endpoint HTTP (sin necesidad de `@sentry/nextjs`). Para CLARA esto
 * es suficiente — no necesitamos source maps, breadcrumbs ni el resto de la
 * suite hasta que el volumen crezca.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  /** Nombre del evento — ej. "alert_sent", "fireman_promoted". Permite agrupar. */
  event: string;
  /** Campos arbitrarios. Mantenelos chicos y serializables. */
  [key: string]: unknown;
}

interface SentryEnvelope {
  event_id: string;
  timestamp: number;
  platform: string;
  level: LogLevel;
  message: { formatted: string };
  extra: Record<string, unknown>;
  tags: Record<string, string>;
}

function emit(level: LogLevel, fields: LogFields) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...fields,
  });
  // stderr para warn/error así Vercel los separa en su UI.
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
  if (level === "error") void sendToSentry(fields);
}

async function sendToSentry(fields: LogFields) {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const parsed = parseSentryDsn(dsn);
    if (!parsed) return;

    const envelope: SentryEnvelope = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      message: { formatted: String(fields.event) },
      extra: Object.fromEntries(
        Object.entries(fields).filter(([k]) => k !== "event")
      ),
      tags: { environment: process.env.VERCEL_ENV ?? "development" },
    };

    // El formato Sentry envelope: header newline body newline body.
    const header = JSON.stringify({
      event_id: envelope.event_id,
      sent_at: new Date().toISOString(),
    });
    const itemHeader = JSON.stringify({ type: "event" });
    const itemPayload = JSON.stringify(envelope);
    const body = `${header}\n${itemHeader}\n${itemPayload}\n`;

    await fetch(`${parsed.url}/envelope/?sentry_key=${parsed.publicKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "User-Agent": "clara-logger/1.0",
      },
      body,
      // No queremos que el reporte a Sentry bloquee la response del usuario.
      // 800ms es generoso para un envelope chico; si timeout, el log ya está
      // en Vercel.
      signal: AbortSignal.timeout(800),
    });
  } catch {
    // Sentry caído no es excusa para que rompamos el handler.
  }
}

function parseSentryDsn(dsn: string): { url: string; publicKey: string } | null {
  // DSN shape: https://<publicKey>@<host>/<projectId>
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      url: `${u.protocol}//${u.host}/api/${projectId}`,
      publicKey,
    };
  } catch {
    return null;
  }
}

export const log = {
  debug: (fields: LogFields) => emit("debug", fields),
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
