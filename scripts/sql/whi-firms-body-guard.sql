-- scripts/sql/whi-firms-body-guard.sql
-- Guard de body no-CSV en fires_sync_step2_process().
--
-- Incidente recurrente (2026-06-19, 2026-07-17): NASA invalida la MAP_KEY y
-- responde el texto "Invalid MAP_KEY." con HTTP 200. El chequeo de status_code
-- nunca lo ve; el parser CSV lo convierte en 0 filas y REEMPLAZA fires_cache
-- con [] cada 15 min — el sitio queda "sin focos" en silencio.
--
-- Este patch: si el body NO empieza con el header CSV ("latitude,..."), NO
-- toca fires_cache (los últimos focos buenos quedan visibles), marca
-- _clara_config.firms_sync_error (el monitor /api/monitor/fires-freshness lo
-- convierte en alerta Telegram) y devuelve 'firms_body_error'. En el camino
-- feliz borra el flag (recovery automático).
--
-- Baseline: la versión WHI-378 (scripts/sql/whi-378-fix-fires-sync-step2.sql).
-- Antes de aplicar, verificar la versión actual con
-- scripts/sql/whi-378-inspect-fires-sync.sql.
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

CREATE OR REPLACE FUNCTION fires_sync_step2_process()
RETURNS TABLE (count INTEGER, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id BIGINT;
  v_status_code INT;
  v_body TEXT;
  v_fires JSONB;
  v_count INT;
BEGIN
  SELECT request_id INTO v_request_id
  FROM _fires_sync_state
  WHERE id = 1;

  IF v_request_id IS NULL THEN
    RETURN QUERY SELECT 0, 'no_pending_request';
    RETURN;
  END IF;

  SELECT r.status_code, r.content
  INTO v_status_code, v_body
  FROM net._http_response r
  WHERE r.id = v_request_id;

  IF v_status_code IS NULL THEN
    RETURN QUERY SELECT 0, 'response_not_ready';
    RETURN;
  END IF;

  IF v_status_code <> 200 THEN
    RETURN QUERY SELECT 0, format('firms_status_%s', v_status_code);
    RETURN;
  END IF;

  -- GUARD: los errores de aplicación de NASA llegan con HTTP 200 y un body de
  -- texto plano ("Invalid MAP_KEY.", rate limit, HTML de mantenimiento). El
  -- CSV real del area API SIEMPRE empieza con el header "latitude,...".
  -- Cualquier otra cosa NO debe pisar fires_cache.
  IF v_body IS NULL OR ltrim(v_body, E' \t\r\n') NOT LIKE 'latitude%' THEN
    INSERT INTO _clara_config (key, value, updated_at)
    VALUES (
      'firms_sync_error',
      now()::text || ' | ' || left(coalesce(v_body, '<empty body>'), 200),
      now()
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
    RETURN QUERY SELECT 0, 'firms_body_error';
    RETURN;
  END IF;

  -- Parse CSV: header is the first line, descartar baja confianza
  WITH lines AS (
    SELECT
      regexp_split_to_table(v_body, E'\\n') AS line,
      generate_series(1, regexp_count(v_body, E'\\n') + 1) AS rn
  ),
  data_lines AS (
    SELECT line FROM lines WHERE rn > 1 AND length(trim(line)) > 0
  ),
  parsed AS (
    SELECT string_to_array(line, ',') AS c
    FROM data_lines
  ),
  filtered AS (
    SELECT
      c[1]::float8                         AS latitude,
      c[2]::float8                         AS longitude,
      COALESCE(c[3]::float8, 0)            AS brightness,
      COALESCE(c[10], 'unknown')           AS confidence,
      COALESCE(c[6], '')                   AS acq_date,
      COALESCE(c[7], '')                   AS acq_time,
      COALESCE(c[13]::float8, 0)           AS frp,
      COALESCE(NULLIF(c[14], '')::int, 0)  AS type
    FROM parsed
    WHERE array_length(c, 1) >= 13
      AND lower(COALESCE(c[10], '')) NOT IN ('low', 'l')
  ),
  -- Dedup por unique key natural (lat, lng, acq_date, acq_time)
  deduped AS (
    SELECT DISTINCT ON (latitude, longitude, acq_date, acq_time)
      latitude, longitude, brightness, confidence, acq_date, acq_time, frp, type
    FROM filtered
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'latitude',   latitude,
      'longitude',  longitude,
      'brightness', brightness,
      'confidence', confidence,
      'acqDate',    acq_date,
      'acqTime',    acq_time,
      'frp',        frp,
      'type',       type
    )), '[]'::jsonb)
  INTO v_fires
  FROM deduped;

  v_count := jsonb_array_length(v_fires);

  -- REEMPLAZA, no concatena (WHI-378)
  INSERT INTO fires_cache (id, fires, count, fetched_at)
  VALUES (1, v_fires, v_count, now())
  ON CONFLICT (id) DO UPDATE
    SET fires = EXCLUDED.fires,
        count = EXCLUDED.count,
        fetched_at = EXCLUDED.fetched_at;

  -- Recovery: un body CSV válido borra el flag de error (si existía).
  DELETE FROM _clara_config WHERE key = 'firms_sync_error';

  -- Limpiar estado de la request
  UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;

  RETURN QUERY SELECT v_count, 'ok';
END;
$$;

-- Verificación post-aplicación:
-- 1. El guard está en la función desplegada:
--    SELECT pg_get_functiondef('fires_sync_step2_process'::regproc) LIKE '%firms_body_error%';
--    → true
-- 2. El camino feliz sigue funcionando (esperar al próximo ciclo o correr a mano):
--    SELECT * FROM fires_sync_step2_process();
--    → (N, 'ok') o (0, 'no_pending_request') — nunca 'firms_body_error' con key sana.
-- 3. fires_cache sigue actualizándose:
--    SELECT count, fetched_at FROM fires_cache WHERE id = 1;
