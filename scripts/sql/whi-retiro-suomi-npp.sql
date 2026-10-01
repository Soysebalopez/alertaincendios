-- scripts/sql/whi-retiro-suomi-npp.sql
-- Retiro de Suomi-NPP (2026-11-01 13:00 UTC) + vencimiento de focos conservados.
--
-- NASA/NOAA anunciaron el 2026-08-03 que Suomi-NPP deja de entregar datos el
-- 1/11/2026 a las 13:00 UTC. Reemplaza a whi-viirs-tres-satelites.sql (pasos 1
-- y 2, y la foto diaria) como versión canónica. Tres cambios:
--
-- 1. Paso 1: desde esa hora deja de pedir VIIRS_SNPP_NRT y borra su
--    "última vez buena", así el monitor no avisa para siempre que está caído.
--    La fecha está escrita UNA vez acá y una en src/lib/viirs-sources.ts
--    (SUOMI_NPP_RETIRED_AT); un test compara las dos.
--
-- 2. Paso 2: 🔴 los focos que se conservan de un satélite caído VENCEN a las
--    24 h de detectados. Faltaba desde el 1/10: con un satélite muerto para
--    siempre, sus últimos focos habrían quedado activos en el mapa
--    indefinidamente.
--
-- 3. La foto diaria del historial pasa a contar NOAA-20. Era Suomi-NPP para
--    que la serie fuera comparable; desde el 1/11 daría 0. NOAA-20 mide casi
--    igual: 2023 cerca de las 78 ciudades, 9.748 (S-NPP) contra 9.995 (N20);
--    el 1/10/2026 en todo el país, 93 contra 97.
--
-- Prueba local: scripts/sql/test/viirs-tres-satelites/run.sh (Postgres
-- descartable). Uso: pegar en Supabase SQL Editor (qmzuwnilehldvobjsbcs).

-- 1. Paso 1
create or replace function public.fires_sync_step1_fetch()
returns void language plpgsql
set search_path = pg_catalog, public as $$
  declare
    _src  text;
    _reqs jsonb := '{}'::jsonb;
  begin
    foreach _src in array array['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] loop
      -- Suomi-NPP deja de entregar datos el 2026-11-01 13:00 UTC (NASA/NOAA).
      -- Misma fecha que SUOMI_NPP_RETIRED_AT en src/lib/viirs-sources.ts.
      continue when _src = 'VIIRS_SNPP_NRT' and now() >= timestamptz '2026-11-01 13:00:00+00';
      _reqs := _reqs || jsonb_build_object(
        _src,
        net.http_get(
          'https://firms.modaps.eosdis.nasa.gov/api/area/csv/'
            || public.clara_firms_map_key()
            || '/' || _src || '/-73.6,-55.1,-53.6,-21.8/1',
          timeout_milliseconds := 30000
        )
      );
    end loop;
    -- request_id queda en NULL: la versión de una sola fuente ya no lo usa.
    -- Un satélite que ya no se pide no tiene "última vez buena" que vigilar:
    -- si quedara, el monitor avisaría para siempre que está caído.
    update public._fires_sync_state
       set requests = _reqs, request_id = null, requested_at = now(),
           source_ok_at = case when _reqs ? 'VIIRS_SNPP_NRT' then source_ok_at else source_ok_at - 'N' end
     where id = 1;
  end;
$$;

-- 2. Paso 2
create or replace function public.fires_sync_step2_process()
returns void language plpgsql
set search_path = pg_catalog, public as $$
  declare
    _reqs      jsonb;
    _src       text;
    _req_id    bigint;
    _status    int;
    _content   text;
    _error     text;
    _sat       text;
    _found     boolean;
    _ok        text[] := '{}';   -- códigos de satélite con CSV válido
    _failed    text[] := '{}';   -- códigos de satélite que fallaron o siguen en vuelo
    _pending   int := 0;
    _http_err  text := null;     -- último error HTTP, para firms_upstream_error
    _body_err  text := null;     -- último cuerpo no-CSV, para firms_sync_error
    _body_errs int := 0;
    _req_ids   bigint[] := '{}';
    _fires     jsonb := '[]'::jsonb;
    _kept      jsonb;
  begin
    select requests into _reqs from _fires_sync_state where id = 1;
    if _reqs is null or _reqs = '{}'::jsonb then return; end if;

    for _src, _req_id in select key, value::bigint from jsonb_each_text(_reqs) loop
      _sat := case _src
        when 'VIIRS_SNPP_NRT'   then 'N'
        when 'VIIRS_NOAA20_NRT' then 'N20'
        when 'VIIRS_NOAA21_NRT' then 'N21'
      end;
      if _sat is null then continue; end if;   -- fuente desconocida: se ignora

      select status_code, content, error_msg, true
        into _status, _content, _error, _found
        from net._http_response
       where id = _req_id;

      -- Sin fila = sigue en vuelo. NO es un error de NASA (ver
      -- whi-firms-upstream-error-guard.sql): no se marca nada, sólo no se usa.
      if not coalesce(_found, false) then
        _pending := _pending + 1;
        _failed := _failed || _sat;
        _found := null;
        continue;
      end if;
      _found := null;
      _req_ids := _req_ids || _req_id;

      if _status is distinct from 200 then
        _http_err := _src || ' ' || coalesce('HTTP ' || _status::text, left(_error, 150), 'sin respuesta de NASA');
        _failed := _failed || _sat;
        continue;
      end if;

      -- 200 sin cuerpo: no se puede distinguir "cero focos" (que trae header)
      -- de una respuesta rota. Se trata como caída de esa fuente.
      if _content is null then
        _failed := _failed || _sat;
        continue;
      end if;

      -- GUARD (2026-07-21): NASA devuelve errores de aplicación con HTTP 200.
      -- El CSV real SIEMPRE empieza con "latitude,...".
      if ltrim(_content, E' \t\r\n') not like 'latitude%' then
        _body_err := _src || ' | ' || left(_content, 200);
        _body_errs := _body_errs + 1;
        _failed := _failed || _sat;
        continue;
      end if;

      -- Mismo parser posicional que antes (los tres CSV tienen el mismo
      -- header, verificado el 2026-10-01), más el satélite.
      with lines as (
        select unnest(string_to_array(_content, E'\n')) as line,
               generate_subscripts(string_to_array(_content, E'\n'), 1) as line_num
      ),
      parsed as (
        select
          (string_to_array(line, ','))[1]::double precision as latitude,
          (string_to_array(line, ','))[2]::double precision as longitude,
          (string_to_array(line, ','))[3]::double precision as brightness,
          (string_to_array(line, ','))[10] as confidence,
          (string_to_array(line, ','))[6] as acq_date,
          (string_to_array(line, ','))[7] as acq_time,
          (string_to_array(line, ','))[13]::double precision as frp,
          (string_to_array(line, ','))[15]::int as fire_type
        from lines
        where line_num > 1 and length(line) > 10
      )
      select _fires || coalesce(jsonb_agg(
               jsonb_build_object(
                 'latitude', latitude, 'longitude', longitude,
                 'brightness', brightness, 'confidence', confidence,
                 'acqDate', acq_date, 'acqTime', acq_time, 'frp', frp,
                 'type', coalesce(fire_type, 0),
                 'satellite', _sat
               )
             ), '[]'::jsonb)
        into _fires
        from parsed
       where latitude is not null and confidence not in ('low', 'l');

      _ok := _ok || _sat;
    end loop;

    -- Nada llegó todavía: se espera, igual que la versión de una fuente.
    if cardinality(_ok) = 0 and _pending > 0 and _http_err is null and _body_err is null then
      return;
    end if;

    if cardinality(_ok) = 0 then
      -- Ninguna fuente sirvió. El caché queda en el último dato bueno y el
      -- monitor avisa por dato viejo. Se registra el motivo para que el aviso
      -- nombre al culpable.
      if _body_errs > 0 and _body_errs = (select count(*) from jsonb_object_keys(_reqs)) then
        insert into _clara_config (key, value, updated_at)
        values ('firms_sync_error', now()::text || ' | ' || _body_err, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
      end if;
      if _http_err is not null then
        insert into _clara_config (key, value, updated_at)
        values ('firms_upstream_error', now()::text || ' | ' || _http_err, now())
        on conflict (key) do update set value = excluded.value, updated_at = now();
      end if;
    else
      -- Los focos de las fuentes caídas se conservan del caché anterior, pero
      -- 🔴 SÓLO SI LOS DETECTÓ HACE MENOS DE 24 H. Sin este vencimiento, un
      -- satélite que deja de responder para siempre dejaría sus últimos focos
      -- congelados en el mapa y en el bot como si estuvieran activos. La API
      -- pide "último día": un foco de más de 24 h tampoco vendría de una
      -- fuente sana.
      select coalesce(jsonb_agg(f), '[]'::jsonb)
        into _kept
        from fires_cache c, jsonb_array_elements(c.fires) f
       where c.id = 1
         and coalesce(f->>'satellite', 'N') = any(_failed)
         and (f->>'acqDate' || ' ' || lpad(f->>'acqTime', 4, '0') || ' +00')::timestamptz
             > now() - interval '24 hours';

      update fires_cache
         set fires = _fires || _kept,
             count = jsonb_array_length(_fires || _kept),
             fetched_at = now()
       where id = 1;

      update _fires_sync_state
         set source_ok_at = source_ok_at || (
               select jsonb_object_agg(s, to_jsonb(now())) from unnest(_ok) s
             )
       where id = 1;

      -- Una fuente con CSV válido prueba que la clave anda y que NASA responde.
      delete from _clara_config where key in ('firms_sync_error', 'firms_upstream_error');
    end if;

    -- Limpieza: las respuestas ya leídas y el estado del ciclo.
    delete from net._http_response where id = any(_req_ids);
    update _fires_sync_state set requests = null where id = 1;
  end;
$$;


-- 3. Foto diaria: NOAA-20 (ver arriba).
select cron.schedule(
  'fires-daily-snapshot',
  '55 23 * * *',
  $cron$
  INSERT INTO fires_daily_history (date, count, avg_frp, high_conf)
  SELECT CURRENT_DATE,
         (SELECT COUNT(*)::int FROM jsonb_array_elements(fires) f
           WHERE f->>'satellite' = 'N20'),
         (SELECT AVG((f->>'frp')::real) FROM jsonb_array_elements(fires) f
           WHERE f->>'satellite' = 'N20'),
         (SELECT COUNT(*)::int FROM jsonb_array_elements(fires) f
           WHERE f->>'satellite' = 'N20' AND f->>'confidence' IN ('high', 'h'))
  FROM fires_cache WHERE id = 1
  ON CONFLICT (date) DO UPDATE
    SET count = EXCLUDED.count, avg_frp = EXCLUDED.avg_frp, high_conf = EXCLUDED.high_conf;
  $cron$
);
