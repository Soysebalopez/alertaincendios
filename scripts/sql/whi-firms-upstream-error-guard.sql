-- scripts/sql/whi-firms-upstream-error-guard.sql
-- Registrar las respuestas FALLIDAS de NASA en fires_sync_step2_process().
--
-- Base: la función REAL de prod (qmzuwnilehldvobjsbcs), leída con
-- pg_get_functiondef el 2026-09-04 antes de tocar nada. Sobre esa versión se
-- agregan SOLO las ramas de error; el camino feliz queda idéntico.
--
-- INCIDENTE QUE RESUELVE (2026-09-04). NASA devolvió HTTP 500 en cuatro
-- pedidos seguidos (17:45, 18:00, 18:15 y 18:30 ART) y dejó fires_cache
-- congelado 75 minutos. A las 18:37 el monitor avisó por Telegram
-- "FIRMS sin actualizar — revisá el cron fires-fetch / pg_net", y esos son
-- justamente los dos componentes que estaban PERFECTOS: el cron corrió sus 24
-- veces y pg_net encoló bien. El aviso mandó a buscar donde no estaba.
--
-- El motivo: esta función sólo miraba las respuestas con status 200
--     SELECT content INTO _content FROM net._http_response
--      WHERE id = _req_id AND status_code = 200;
--     IF _content IS NULL THEN RETURN; END IF;
-- así que una respuesta 500 salía por un RETURN mudo. Sin flag, sin log, sin
-- rastro. Ya existía un guard para "NASA contesta mal" (body no-CSV con HTTP
-- 200 = MAP_KEY invalidada), pero no para "NASA no contesta".
--
-- ⚠️ LA TRAMPA, Y POR QUÉ ESTA VERSIÓN MIRA EL STATUS Y NO EL CONTENIDO.
-- "Todavía no llegó la respuesta" y "llegó con error" producían las dos un
-- SELECT vacío, y significan cosas opuestas: el paso 2 corre 2 minutos después
-- del paso 1, y NASA a veces tarda más que eso. Marcar error ante un SELECT
-- vacío inventaría caídas de NASA que no existieron. Por eso: si NO HAY FILA
-- se vuelve sin hacer nada (el próximo ciclo la encuentra), y sólo se marca
-- error cuando hay fila Y su status no es 200.
--   Misma clase que el falso positivo del 2026-08-26 en el monitor:
--   "no pude leer" no es "no hay datos", y las dos llegan como null.
--
-- El flag NO agrega un aviso nuevo ni cambia el umbral —una caída de 15
-- minutos no molesta a nadie— sólo cambia QUÉ DICE el aviso que ya existía.
-- Lo lee src/lib/fires-freshness.ts (buildStaleAlert).
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

CREATE OR REPLACE FUNCTION public.fires_sync_step2_process()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
    DECLARE
      _req_id  bigint;
      _content text;
      _status  int;
      _error   text;
    BEGIN
      SELECT request_id INTO _req_id FROM _fires_sync_state WHERE id = 1;
      IF _req_id IS NULL THEN RETURN; END IF;

      SELECT status_code, content, error_msg
        INTO _status, _content, _error
        FROM net._http_response
       WHERE id = _req_id;

      -- Sin fila = el pedido sigue en vuelo. NO es un error: se procesa en el
      -- próximo ciclo. Ver la nota de arriba sobre por qué esto importa.
      IF NOT FOUND THEN RETURN; END IF;

      -- NUEVO (2026-09-04): NASA respondió, pero mal. Se registra para que el
      -- aviso pueda nombrarla, y se limpia el estado igual que en el camino
      -- normal (antes la fila fallida quedaba acumulándose en la tabla).
      IF _status IS DISTINCT FROM 200 THEN
        INSERT INTO _clara_config (key, value, updated_at)
        VALUES (
          'firms_upstream_error',
          now()::text || ' | ' || COALESCE(
            'HTTP ' || _status::text,
            left(_error, 150),
            'sin respuesta de NASA'
          ),
          now()
        )
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

        DELETE FROM net._http_response WHERE id = _req_id;
        UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
        RETURN;
      END IF;

      -- HTTP 200 con cuerpo vacío. La versión anterior lo cubría de rebote
      -- (su SELECT filtraba por status 200 y devolvía NULL). Se mantiene
      -- explícito: sin esto, el parser de abajo produciría 0 filas y PISARÍA
      -- fires_cache con [], que es exactamente el daño que evita el guard.
      IF _content IS NULL THEN RETURN; END IF;

      -- GUARD (2026-07-21): NASA devuelve errores de aplicación ("Invalid
      -- MAP_KEY.", rate limit, HTML de mantenimiento) con HTTP 200. El CSV
      -- real del area API SIEMPRE empieza con el header "latitude,...".
      -- Cualquier otra cosa NO debe pisar fires_cache: se marca el flag
      -- firms_sync_error (el monitor lo convierte en alerta Telegram) y se
      -- limpia el estado de la request como en el camino normal.
      IF ltrim(_content, E' \t\r\n') NOT LIKE 'latitude%' THEN
        INSERT INTO _clara_config (key, value, updated_at)
        VALUES (
          'firms_sync_error',
          now()::text || ' | ' || left(_content, 200),
          now()
        )
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

        DELETE FROM net._http_response WHERE id = _req_id;
        UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
        RETURN;
      END IF;

      WITH lines AS (
        SELECT unnest(string_to_array(_content, E'\n')) AS line,
               generate_subscripts(string_to_array(_content, E'\n'), 1) AS line_num
      ),
      parsed AS (
        SELECT
          (string_to_array(line, ','))[1]::double precision AS latitude,
          (string_to_array(line, ','))[2]::double precision AS longitude,
          (string_to_array(line, ','))[3]::double precision AS brightness,
          (string_to_array(line, ','))[10] AS confidence,
          (string_to_array(line, ','))[6] AS acq_date,
          (string_to_array(line, ','))[7] AS acq_time,
          (string_to_array(line, ','))[13]::double precision AS frp,
          (string_to_array(line, ','))[15]::int AS fire_type
        FROM lines
        WHERE line_num > 1 AND length(line) > 10
      ),
      filtered AS (
        SELECT jsonb_agg(
          jsonb_build_object(
            'latitude', latitude, 'longitude', longitude,
            'brightness', brightness, 'confidence', confidence,
            'acqDate', acq_date, 'acqTime', acq_time, 'frp', frp,
            'type', COALESCE(fire_type, 0)
          )
        ) AS fires, COUNT(*)::int AS cnt
        FROM parsed
        WHERE latitude IS NOT NULL AND confidence NOT IN ('low', 'l')
      )
      UPDATE fires_cache
      SET fires = COALESCE(filtered.fires, '[]'::jsonb),
          count = filtered.cnt,
          fetched_at = now()
      FROM filtered
      WHERE fires_cache.id = 1;

      -- Recovery: un body CSV válido borra los DOS flags de error. El de
      -- upstream se suma acá — si no, un 500 aislado dejaría el aviso
      -- culpando a NASA para siempre.
      DELETE FROM _clara_config WHERE key IN ('firms_sync_error', 'firms_upstream_error');

      -- Cleanup
      DELETE FROM net._http_response WHERE id = _req_id;
      UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
    END;
    $function$;
