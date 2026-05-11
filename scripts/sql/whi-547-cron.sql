-- WHI-547 — pg_cron job para enviar alertas preliminares GOES.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Schedule: cada 10 min en :07/:17/.../:57 — 2 min después de que goes-sync
-- termina de escribir a goes_preliminary. Patrón paralelo al de fires-alerts.

SELECT cron.schedule(
  'goes-alerts',
  '7,17,27,37,47,57 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/goes-alerts?secret=fad9f905b2213f552215999c370a38105b024c457b64dd40ef5de5bf0e9fd876',
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
