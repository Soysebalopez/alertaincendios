-- Escenarios del paso 1 y el paso 2 con tres fuentes. Lo corre run.sh.
\set ON_ERROR_STOP 1
create function t_csv(sat text, n int, conf text default 'n') returns text language sql as $$
  select 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight' || E'\n' ||
   string_agg(format('-3%s.1234%s,-6%s.5,306.05,0.61,0.54,2026-10-01,438,%s,VIIRS,%s,2.0NRT,286.7,1.18,N', i, i, i, sat, conf), E'\n') || E'\n'
  from generate_series(1,n) i $$;
create function t_reply(src text, status int, body text) returns void language sql as $$
  insert into net._http_response select (s.requests->>src)::bigint, status, body, null from _fires_sync_state s where id=1 $$;
create function t_assert(ok boolean, msg text) returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'FALLA: %', msg; end if; raise notice 'ok: %', msg; end $$;
create function t_count(sat text) returns int language sql as $$ select count(*)::int from fires_cache c, jsonb_array_elements(c.fires) f where coalesce(f->>'satellite','N')=sat $$;

-- ===== 1. los tres llegan bien
select fires_sync_step1_fetch();
select t_assert((select count(*) from net._queue)=3, 'paso 1 hace 3 pedidos');
select t_assert((select bool_and(url like '%SECRETKEY/VIIRS_%_NRT/-73.6,-55.1,-53.6,-21.8/1') from net._queue), 'URLs con clave, fuente y recorte');
select t_assert((select count(distinct substring(url from 'VIIRS_[A-Z0-9]+_NRT')) from net._queue)=3, 'tres fuentes distintas');
select t_reply('VIIRS_SNPP_NRT',200,t_csv('N',3)); select t_reply('VIIRS_NOAA20_NRT',200,t_csv('N20',4)); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',2));
insert into _clara_config values ('firms_upstream_error','viejo',now()),('firms_sync_error','viejo',now());
select fires_sync_step2_process();
select t_assert(t_count('N')=3 and t_count('N20')=4 and t_count('N21')=2, 'cache = 3 N + 4 N20 + 2 N21 (los 2 viejos reemplazados)');
select t_assert((select count from fires_cache)=9, 'count = 9');
select t_assert((select fetched_at > now() - interval '1 min' from fires_cache), 'fetched_at avanzó');
select t_assert((select (select count(*) from jsonb_object_keys(source_ok_at))=3 from _fires_sync_state), 'source_ok_at tiene las 3');
select t_assert((select requests is null from _fires_sync_state), 'estado limpio');
select t_assert((select count(*) from net._http_response)=0, 'respuestas borradas');
select t_assert((select count(*) from _clara_config where key in ('firms_sync_error','firms_upstream_error'))=0, 'flags borrados');
select t_assert((select (f->>'latitude')::float = -31.12341 and f->>'acqTime'='438' and (f->>'frp')::float=1.18 and f->>'confidence'='n' from fires_cache c, jsonb_array_elements(c.fires) f where f->>'satellite'='N' limit 1), 'columnas parseadas igual que antes');

-- ===== 2. NOAA-21 da 500: sus focos anteriores se conservan, el resto se renueva
update _fires_sync_state set source_ok_at = jsonb_set(source_ok_at, '{N21}', '"2026-01-01T00:00:00Z"');
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,t_csv('N',5)); select t_reply('VIIRS_NOAA20_NRT',200,t_csv('N20',1)); select t_reply('VIIRS_NOAA21_NRT',500,'Internal error');
select fires_sync_step2_process();
select t_assert(t_count('N')=5 and t_count('N20')=1 and t_count('N21')=2, 'N21 caído conserva sus 2 focos');
select t_assert((select source_ok_at->>'N21' like '2026-01-01%' from _fires_sync_state), 'N21 NO actualiza su última vez buena');
select t_assert((select count(*) from _clara_config where key='firms_upstream_error')=0, 'falla parcial no marca upstream_error');

-- ===== 3. NOAA-20 sigue en vuelo: se procesan las otras, NOAA-20 conserva
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,t_csv('N',2)); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',3));
select fires_sync_step2_process();
select t_assert(t_count('N')=2 and t_count('N20')=1 and t_count('N21')=3, 'N20 en vuelo conserva su foco');

-- ===== 4. las tres en vuelo: no toca nada y conserva el estado
select fires_sync_step1_fetch();
select fires_sync_step2_process();
select t_assert((select requests is not null from _fires_sync_state), 'todo en vuelo: estado se conserva');
select t_assert((select count from fires_cache)=6, 'todo en vuelo: cache intacto');

-- ===== 5. MAP_KEY inválida (las tres con cuerpo no-CSV)
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,'Invalid MAP_KEY.'); select t_reply('VIIRS_NOAA20_NRT',200,'Invalid MAP_KEY.'); select t_reply('VIIRS_NOAA21_NRT',200,'Invalid MAP_KEY.');
update fires_cache set fetched_at = '2026-01-01';
select fires_sync_step2_process();
select t_assert((select value like '%Invalid MAP_KEY.%' from _clara_config where key='firms_sync_error'), 'tres no-CSV => firms_sync_error');
select t_assert((select fetched_at = '2026-01-01' and count=6 from fires_cache), 'clave inválida: cache congelado');
select t_assert((select requests is null from _fires_sync_state), 'clave inválida: estado limpio');
-- recuperación
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,t_csv('N',1)); select t_reply('VIIRS_NOAA20_NRT',200,'Invalid MAP_KEY.'); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',1));
select fires_sync_step2_process();
select t_assert((select count(*) from _clara_config where key='firms_sync_error')=0, 'una fuente buena borra firms_sync_error');

-- ===== 6. una sola no-CSV no acusa a la clave
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,'<html>maintenance</html>'); select t_reply('VIIRS_NOAA20_NRT',200,t_csv('N20',1)); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',1));
select fires_sync_step2_process();
select t_assert((select count(*) from _clara_config where key='firms_sync_error')=0, 'una no-CSV no marca firms_sync_error');
select t_assert(t_count('N')=1, 'SNPP no-CSV conserva su foco');

-- ===== 7. las tres con 500
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',500,'x'); select t_reply('VIIRS_NOAA20_NRT',503,'x'); select t_reply('VIIRS_NOAA21_NRT',500,'x');
select fires_sync_step2_process();
select t_assert((select value like '%HTTP 5%' from _clara_config where key='firms_upstream_error'), 'todas 5xx => upstream_error');
select t_assert((select count(*) from _clara_config where key='firms_sync_error')=0, 'todas 5xx no acusa a la clave');

-- ===== 8. confianza baja se descarta; cero focos es dato válido
select fires_sync_step1_fetch();
select t_reply('VIIRS_SNPP_NRT',200,t_csv('N',4,'l')); select t_reply('VIIRS_NOAA20_NRT',200,'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight'||E'\n'); select t_reply('VIIRS_NOAA21_NRT',200,t_csv('N21',2,'h'));
select fires_sync_step2_process();
select t_assert(t_count('N')=0 and t_count('N20')=0 and t_count('N21')=2, 'low descartado; NOAA-20 sin focos queda en 0');
select t_assert((select count from fires_cache)=2, 'count = 2');
select t_assert((select count(*) from _clara_config where key='firms_upstream_error')=0, 'recuperado: upstream_error borrado');
