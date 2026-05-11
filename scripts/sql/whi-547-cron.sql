-- WHI-547 — pg_cron job para enviar alertas preliminares GOES.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Schedule: cada 10 min en :07/:17/.../:57 — 2 min después de que goes-sync
-- termina de escribir a goes_preliminary. Patrón paralelo al de fires-alerts.

-- ⚠️ Replace <CRON_SECRET> with the literal value from Vercel env before running.
-- Do NOT commit the populated SQL. Same pattern as the existing fires-alerts cron.
SELECT cron.schedule(
  'goes-alerts',
  '7,17,27,37,47,57 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/goes-alerts?secret=<CRON_SECRET>',
      timeout_milliseconds := 60000
    )$$
);

-- Verificación
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname IN ('goes-sync', 'goes-alerts', 'fires-alerts')
ORDER BY jobname;

-- Para borrar (si hace falta rehacer):
-- SELECT cron.unschedule('goes-alerts');
