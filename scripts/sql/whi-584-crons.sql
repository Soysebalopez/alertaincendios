-- WHI-584 — pg_cron jobs adicionales para UX v2 de WHI-547.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

-- Daily "falsa alarma" notifications a las 12:00 UTC (~09:00 ART)
-- ⚠️ Replace <CRON_SECRET> with the literal value from Vercel env before running.
-- Do NOT commit the populated SQL.
SELECT cron.schedule(
  'goes-dismissals',
  '0 12 * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/goes-dismissals?secret=<CRON_SECRET>',
      timeout_milliseconds := 60000
    )$$
);

-- Daily prune de goes_preliminary > 7 días sin alerta asociada (ahorra storage)
SELECT cron.schedule(
  'goes-prune',
  '30 3 * * *',  -- 03:30 UTC = 00:30 ART, baja actividad
  $$DELETE FROM goes_preliminary
    WHERE detected_at < now() - interval '7 days'
      AND id NOT IN (SELECT DISTINCT goes_id FROM goes_alerted)$$
);

-- Verificación
SELECT jobid, jobname, schedule
FROM cron.job
WHERE jobname IN ('goes-dismissals', 'goes-prune')
ORDER BY jobname;

-- Para borrar (si hace falta rehacer):
-- SELECT cron.unschedule('goes-dismissals');
-- SELECT cron.unschedule('goes-prune');
