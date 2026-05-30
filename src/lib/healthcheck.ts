/**
 * Dead-man's-switch (P2-1). Cada cron que termina BIEN pinga este check externo
 * (Healthchecks.io). Si el ping no llega a tiempo, Healthchecks alerta al owner.
 *
 * Externo a propósito: detecta caídas que el propio sistema no podría avisar
 * (incluidos los HTTP 503 FUNCTION_THROTTLED de Vercel, que dejan al cron como
 * "succeeded" en pg_cron pero sin hacer el trabajo).
 *
 * No-op si HEALTHCHECK_PING_URL no está seteada. Best-effort: nunca rompe el cron.
 */
export async function pingHealthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_PING_URL;
  if (!url) return;
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    // best-effort: un ping fallido no debe afectar el resultado del cron.
  }
}
