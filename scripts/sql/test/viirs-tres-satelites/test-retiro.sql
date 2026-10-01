-- Retiro de Suomi-NPP. run.sh carga el SQL con la fecha de corte movida al
-- pasado, así se prueba hoy lo que pasa desde el 2026-11-01 13:00 UTC.
\set ON_ERROR_STOP 1
update _fires_sync_state set source_ok_at = '{"N":"2026-10-01T00:00:00Z","N20":"2026-10-01T00:00:00Z","N21":"2026-10-01T00:00:00Z"}'::jsonb;
update fires_cache set fires = (select jsonb_agg(f || '{"satellite":"N"}'::jsonb) from jsonb_array_elements(fires) f);
select fires_sync_step1_fetch();
select t_assert((select not (requests ? 'VIIRS_SNPP_NRT') and requests ? 'VIIRS_NOAA20_NRT' and requests ? 'VIIRS_NOAA21_NRT' from _fires_sync_state), 'Suomi-NPP ya no se pide');
select t_assert((select not (source_ok_at ? 'N') and source_ok_at ? 'N20' from _fires_sync_state), 'Suomi-NPP sale de source_ok_at');
select t_reply('VIIRS_NOAA20_NRT',200,t_csv('N20',2)); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',1));
select fires_sync_step2_process();
select t_assert(t_count('N')=0 and t_count('N20')=2 and t_count('N21')=1, 'los focos viejos de Suomi-NPP desaparecen (no es una fuente caída: ya no se pide)');
