-- scripts/sql/whi-firms-body-guard.sql
-- Guard de body no-CSV en fires_sync_step2_process().
--
-- APLICADO A PROD (qmzuwnilehldvobjsbcs) el 2026-07-21. Este archivo refleja
-- la función REAL desplegada — verificada con pg_get_functiondef durante la
-- aplicación. La versión de prod difiere del viejo baseline versionado
-- (whi-378-fix-fires-sync-step2.sql): RETURNS void (no TABLE), SET search_path
-- fijado, parsea la columna 15 como type, borra la fila de net._http_response
-- al terminar, y usa UPDATE (no INSERT ON CONFLICT) sobre fires_cache.
-- Lección: ante cualquier cambio futuro, inspeccionar SIEMPRE la función real
-- primero (scripts/sql/whi-378-inspect-fires-sync.sql).
--
-- Incidente que resuelve (recurrente: 2026-06-19, 2026-07-17): NASA invalida
-- la MAP_KEY y responde "Invalid MAP_KEY." con HTTP 200. El parser CSV lo
-- convertía en 0 filas y REEMPLAZABA fires_cache con [] cada 15 min — el
-- sitio quedaba "sin focos" en silencio.
--
-- Este guard: si el body NO empieza con el header CSV ("latitude,..."), NO
-- toca fires_cache (los últimos focos buenos quedan visibles), marca
-- _clara_config.firms_sync_error (el monitor /api/monitor/fires-freshness lo
-- convierte en alerta Telegram) y limpia el estado de la request. En el
-- camino feliz borra el flag (recovery automático).
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

CREATE OR REPLACE FUNCTION public.fires_sync_step2_process()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
    DECLARE
      _req_id bigint;
      _content text;
    BEGIN
      SELECT request_id INTO _req_id FROM _fires_sync_state WHERE id = 1;
      IF _req_id IS NULL THEN RETURN; END IF;

      SELECT content INTO _content
      FROM net._http_response
      WHERE id = _req_id AND status_code = 200;

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

      -- Recovery: un body CSV válido borra el flag de error (si existía).
      DELETE FROM _clara_config WHERE key = 'firms_sync_error';

      -- Cleanup
      DELETE FROM net._http_response WHERE id = _req_id;
      UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
    END;
    $function$;

-- Verificación post-aplicación (ejecutada OK el 2026-07-21: true / count 145):
-- 1. El guard está en la función desplegada:
--    SELECT pg_get_functiondef('fires_sync_step2_process'::regproc) LIKE '%firms_sync_error%';
--    → true
-- 2. fires_cache sigue actualizándose (próximo ciclo ≤15 min):
--    SELECT count, fetched_at FROM fires_cache WHERE id = 1;
