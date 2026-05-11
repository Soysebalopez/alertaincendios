-- WHI-545 — pg_cron schedule para sincronizar GOES-19 FDC cada 10 min.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
-- Antes de correr: configurar los Postgres parameters con los valores reales:
--
--   ALTER DATABASE postgres SET app.goes_sync_url
--     = 'https://alertaincendios.vercel.app/api/goes-sync';
--   ALTER DATABASE postgres SET app.cron_secret = '<value of CRON_SECRET in Vercel>';
--
-- Después reconectar la sesión (los settings se aplican en nuevas conexiones).

-- Función que dispara el sync. Usa pg_net (ya habilitado en este proyecto
-- para fires-fetch / fires-alerts).
CREATE OR REPLACE FUNCTION trigger_goes_sync()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_url    TEXT := current_setting('app.goes_sync_url', true);
  v_secret TEXT := current_setting('app.cron_secret', true);
  v_request_id BIGINT;
BEGIN
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE EXCEPTION 'app.goes_sync_url or app.cron_secret not configured';
  END IF;

  -- pg_net es async — devuelve un request_id que se puede consultar después
  -- en net._http_response si hace falta debuggear. Para el cron normal nos
  -- alcanza con dispararlo y no esperar (el endpoint Python escribe directo
  -- a goes_preliminary).
  SELECT net.http_get(
    url := v_url || '?secret=' || v_secret,
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- pg_cron job: cada 10 min, offset 5 min para coincidir con que el archivo
-- GOES suele estar listo ~2-3 min después del fin del scan.
-- Schedule en UTC. Patrón cron: */10 a partir de :05 — sea :05, :15, :25, :35, :45, :55.
SELECT cron.schedule(
  'goes-sync',
  '5,15,25,35,45,55 * * * *',
  $$ SELECT trigger_goes_sync(); $$
);

-- Verificar que el job quedó programado
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname = 'goes-sync';

-- Para borrar el job (si hace falta rehacerlo):
-- SELECT cron.unschedule('goes-sync');

-- Para ver últimas corridas y resultado HTTP:
-- SELECT j.jobname, r.start_time, r.end_time, r.status, r.return_message
-- FROM cron.job j
-- JOIN cron.job_run_details r ON r.jobid = j.jobid
-- WHERE j.jobname = 'goes-sync'
-- ORDER BY r.start_time DESC
-- LIMIT 10;

-- Para inspeccionar respuestas HTTP de pg_net (las del último día):
-- SELECT status_code, content::text, created
-- FROM net._http_response
-- WHERE created > now() - interval '1 day'
-- ORDER BY created DESC
-- LIMIT 20;
