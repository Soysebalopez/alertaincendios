-- Fix fires-daily-snapshot timing bug (2026-05-22)
--
-- Problema:
--   El cron job `fires-daily-snapshot` (jobid=5) corría a las `55 2 * * *`
--   (02:55 UTC = 23:55 ART). A esa hora, `fires_cache` recién se había
--   refrescado a las 02:49 UTC con datos de FIRMS, que por defecto sirve
--   sólo "current UTC day". Con apenas ~3h del nuevo día UTC, el cache
--   estaba casi vacío.
--
--   Resultado: 41 días consecutivos con count=0 en `fires_daily_history`
--   (entre 2026-04-11 y 2026-05-22) aunque /api/fires en producción
--   reportaba decenas de focos activos.
--
-- Diagnóstico:
--   1. `INSERT 0 1` en `cron.job_run_details` → el cron sí corría y sí
--      insertaba 1 row por día.
--   2. SQL del cron es correcto — reescribir manualmente a las 13:17 UTC
--      con `CURRENT_DATE` y `fires_cache.count` insertó count=82 sin tocar
--      el comando del job. Confirma que el bug es timing.
--   3. `fires_cache.fires[0].acqDate` siempre matchea "current UTC day".
--      FIRMS no sirve días pasados. `fires_cache` se REEMPLAZA por
--      `fires-process`, no acumula entre días.
--
-- Fix:
--   Mover el schedule a `55 23 * * *` (23:55 UTC = 20:55 ART). A esa hora,
--   `fires_cache` ya acumuló casi 24h de actividad del current UTC day,
--   y CURRENT_DATE (UTC) sigue siendo ese mismo día.
--
-- Verificación post-fix:
--   El próximo run inserta una row con count > 0 para el día UTC current.
--   Validar mañana con: SELECT * FROM fires_daily_history ORDER BY date DESC LIMIT 3;

SELECT cron.alter_job(5, schedule := '55 23 * * *');

-- Sanity check
SELECT jobid, schedule, jobname, active
FROM cron.job
WHERE jobid = 5;
