-- WHI-907 checkpoint C5 — tareas programadas nuevas (pg_cron → Vercel).
--
-- Aprobado por Seba y aplicado el 2026-09-14. Verificado después: metar-sync
-- activo en cron.job y respondiendo 200 (guardó 3 lecturas de SAZB), y el menú
-- del bot respondió 200 con 9 comandos.
--
-- Mismo patrón que whi-fwi-cron.sql: la URL
-- escrita y el secreto desde clara_cron_secret(), nunca en el texto. Usa
-- alertaincendios.vercel.app porque el dominio propio redirige y pg_net no
-- sigue redirecciones.
--
-- Aplicar DESPUÉS de whi-907-wind.sql y whi-907-lightning.sql.

-- 1. Viento medido del aeropuerto (METAR SAZB), a los 10 minutos de cada hora.
select cron.schedule(
  'metar-sync',
  '10 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/metar-sync?secret=' || clara_cron_secret(),
      timeout_milliseconds := 30000
    )$$
);

-- 2. Menú del bot: una sola vez, no es un cron. Saca /soybombero y /dejarcuartel.
select net.http_get(
  'https://alertaincendios.vercel.app/api/bot/sync-commands?secret=' || clara_cron_secret(),
  timeout_milliseconds := 30000
);

-- 3. Rayos reales del GLM cada 5 minutos. Aplicado el 2026-09-17 con OK de Seba,
-- después de mudar el proyecto al equipo Pro (WHI-911): en el plan gratuito esta
-- sola tarea gastaba varias veces el cupo mensual de CPU.
select cron.schedule(
  'glm-sync',
  '*/5 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/glm-sync?secret=' || clara_cron_secret(),
      timeout_milliseconds := 120000
    )$$
);

-- 4. Limpieza diaria del viento. BORRA las lecturas de más de 90 días (y los
-- pronósticos de más de 3 días, tabla que está vacía). OK explícito de Seba el
-- 2026-09-17; la primera vez que borre algo será a mediados de diciembre.
select cron.schedule('purge-old-wind-data', '40 3 * * *', 'SELECT purge_old_wind_data()');

-- PENDIENTE, NO APLICAR todavía:
--
-- Limpieza de rayos: BORRA los flashes de más de 7 días. Necesita su propio OK.
--   select cron.schedule('purge-old-lightning-flashes', '45 3 * * *', 'SELECT purge_old_lightning_flashes()');
--
-- smn-wrf-sync: NO se programa. El 14/9 el SMN midió peor que Open-Meteo en la
-- dirección del viento; sin pronóstico cargado, fetchWind() usa Open-Meteo.
--
-- Verificar:
--   select jobname, schedule, active from cron.job where jobname = 'metar-sync';
--   select id, status_code, created from net._http_response order by created desc limit 5;
--   select count(*), max(observed_at) from wind_observations;
