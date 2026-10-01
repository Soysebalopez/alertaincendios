-- scripts/sql/whi-viirs-tres-satelites.sql
-- FIRMS: pedir los focos de los TRES satélites con VIIRS, no sólo de Suomi-NPP.
--
-- Base: las funciones REALES de prod (qmzuwnilehldvobjsbcs), leídas con
-- pg_get_functiondef el 2026-10-01 antes de tocar nada. Reemplaza a
-- whi-firms-map-key-config.sql (paso 1) y whi-firms-upstream-error-guard.sql
-- (paso 2) como versión canónica.
--
-- POR QUÉ. Hasta el 2026-10-01 el paso 1 pedía UNA fuente: VIIRS_SNPP_NRT
-- (Suomi-NPP). El mismo sensor vuela en NOAA-20 y NOAA-21, en otros horarios,
-- y sus focos no entraban nunca. Medido ese día, mismo recorte y misma ventana
-- de 1 día: Suomi-NPP 93 detecciones, NOAA-20 97, NOAA-21 72. Con los tres, un
-- incendio se ve antes porque el próximo pase llega antes.
--
-- COSTO EN LA CUOTA DE NASA, MEDIDO EL 2026-10-01 contra mapkey_status:
-- tope 5.000 transacciones cada 10 minutos. Las tres descargas + una consulta
-- de estado gastaron 6. Con tres pedidos cada 15 minutos se usa < 0,2 % del tope.
--
-- QUÉ CAMBIA EN EL PASO 2 (y por qué no es "lo mismo tres veces"):
--
-- 1. Cada fuente se evalúa POR SEPARADO: llegó bien / sigue en vuelo /
--    NASA respondió error / cuerpo que no es CSV. Una fuente que falla NO
--    tira a las otras dos: el caché se actualiza con las que llegaron bien.
--
-- 2. 🔴 LA QUE FALLA CONSERVA SUS FOCOS ANTERIORES. Sin esto, un error de
--    NOAA-21 haría DESAPARECER sus focos del mapa y del bot durante ese ciclo
--    — y "no hay foco" es la peor respuesta posible si el foco existe. Se
--    copian del caché anterior los focos cuyo `satellite` es el de la fuente
--    caída. (Los focos guardados antes de este cambio no tienen `satellite`:
--    son todos de Suomi-NPP, y así se los trata.)
--
-- 3. Como el caché se sigue actualizando con dos de tres fuentes, el aviso de
--    "dato viejo" (que mira fires_cache.fetched_at) NO se enteraría de que un
--    satélite lleva horas caído. Por eso cada fuente anota cuándo trajo dato
--    bueno por última vez (`_fires_sync_state.source_ok_at`) y el monitor
--    avisa por satélite (src/lib/fires-freshness.ts, decideSourceActions).
--    Una verificación que cubre una parte del problema informa éxito con la
--    otra rota.
--
-- 4. Los flags de siempre conservan su significado:
--    - firms_sync_error   = TODAS las fuentes devolvieron algo que no es CSV
--                           (la firma de una MAP_KEY inválida, que es de las
--                           tres a la vez). Una sola fuente con cuerpo raro NO
--                           dispara "MAP_KEY inválida": sería un aviso falso.
--    - firms_upstream_error = ninguna fuente trajo dato bueno y alguna
--                           respondió con status != 200. Sólo cambia QUÉ dice
--                           el aviso de dato viejo.
--    Los dos se borran en cuanto UNA fuente trae CSV válido: la clave anda.
--
-- 5. Cada foco lleva `satellite` con el código que usa la propia NASA en su
--    CSV: N (Suomi-NPP), N20 (NOAA-20), N21 (NOAA-21).
--
-- ⚠️ ORDEN DE APLICACIÓN: después de desplegar el código que agrupa los avisos
-- de bosque por incendio (src/lib/fire-incident.ts). Con tres satélites, el
-- mismo incendio llega como tres detecciones en lugares distintos — cada
-- satélite tiene su propia grilla de píxeles —, y la clave vieja (posición
-- exacta + día) las tomaba como tres incendios: tres avisos.
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

-- 1. Estado: un id de pedido por fuente + la última vez que cada una anduvo.
alter table public._fires_sync_state
  add column if not exists requests jsonb,
  add column if not exists source_ok_at jsonb not null default '{}'::jsonb;

-- 2. Paso 1: tres pedidos, uno por satélite.
create or replace function public.fires_sync_step1_fetch()
returns void language plpgsql
set search_path = pg_catalog, public as $$
  declare
    _src  text;
    _reqs jsonb := '{}'::jsonb;
  begin
    foreach _src in array array['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] loop
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
    update public._fires_sync_state
       set requests = _reqs, request_id = null, requested_at = now()
     where id = 1;
  end;
$$;

-- 3. Paso 2: evaluar cada fuente, juntar las buenas, conservar las caídas.
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
      -- Los focos de las fuentes caídas se conservan del caché anterior.
      select coalesce(jsonb_agg(f), '[]'::jsonb)
        into _kept
        from fires_cache c, jsonb_array_elements(c.fires) f
       where c.id = 1
         and coalesce(f->>'satellite', 'N') = any(_failed);

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

-- 4. La foto diaria del historial sigue contando SÓLO Suomi-NPP.
--
-- fires_daily_history se recalculó el 2026-09-18 sobre el archivo de NASA de
-- Suomi-NPP, y los años anteriores también son de Suomi-NPP. Si la foto
-- empezara a sumar los tres satélites, el gráfico de /historial saltaría a casi
-- el triple el 1/10/2026 sin que haya más fuego: un salto que se lee como
-- "explotó la temporada". Contar el mismo satélite de siempre mantiene la serie
-- comparable. (Los focos sin `satellite` son anteriores a este cambio: N.)
--
-- Mismo comando que el job actual (leído de cron.job el 2026-10-01), con el
-- filtro agregado en los tres conteos. cron.schedule con un nombre existente
-- reemplaza el job.
select cron.schedule(
  'fires-daily-snapshot',
  '55 23 * * *',
  $cron$
  INSERT INTO fires_daily_history (date, count, avg_frp, high_conf)
  SELECT CURRENT_DATE,
         (SELECT COUNT(*)::int FROM jsonb_array_elements(fires) f
           WHERE coalesce(f->>'satellite', 'N') = 'N'),
         (SELECT AVG((f->>'frp')::real) FROM jsonb_array_elements(fires) f
           WHERE coalesce(f->>'satellite', 'N') = 'N'),
         (SELECT COUNT(*)::int FROM jsonb_array_elements(fires) f
           WHERE coalesce(f->>'satellite', 'N') = 'N' AND f->>'confidence' IN ('high', 'h'))
  FROM fires_cache WHERE id = 1
  ON CONFLICT (date) DO UPDATE
    SET count = EXCLUDED.count, avg_frp = EXCLUDED.avg_frp, high_conf = EXCLUDED.high_conf;
  $cron$
);
