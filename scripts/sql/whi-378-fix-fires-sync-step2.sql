-- WHI-378 — Fix de fires_sync_step2_process(): reemplazar, no concatenar.
--
-- IMPORTANTE: antes de aplicar este patch, ejecutar primero
-- scripts/sql/whi-378-inspect-fires-sync.sql para ver la versión actual
-- y confirmar el bug. La parsing del CSV depende del orden de columnas
-- de FIRMS (que cambia poco pero conviene verificar contra la función
-- real).
--
-- Cambios respecto a la versión buggy:
--   - Usa UPDATE ... SET fires = v_fires (REEMPLAZA)
--     en vez de UPDATE ... SET fires = fires || v_fires (CONCATENA)
--   - Dedup por (lat, lng, acq_date, acq_time) antes de escribir, como
--     defensa en profundidad si FIRMS devuelve filas repetidas.
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

  -- REEMPLAZA, no concatena (este era el bug WHI-378)
  INSERT INTO fires_cache (id, fires, count, fetched_at)
  VALUES (1, v_fires, v_count, now())
  ON CONFLICT (id) DO UPDATE
    SET fires = EXCLUDED.fires,
        count = EXCLUDED.count,
        fetched_at = EXCLUDED.fetched_at;

  -- Limpiar estado de la request
  UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;

  RETURN QUERY SELECT v_count, 'ok';
END;
$$;
