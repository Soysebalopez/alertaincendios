-- WHI-378 — Inspecciona la función fires_sync_step2_process()
-- para verificar si está concatenando focos en vez de reemplazarlos.
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs)
-- o ejecutar via management API con el script scripts/fix-fires-sync.sh

-- 1. Definición actual de la función
SELECT proname, pg_get_functiondef(oid) AS def
FROM pg_proc
WHERE proname IN ('fires_sync_step1_fetch', 'fires_sync_step2_process')
ORDER BY proname;

-- 2. Tamaño actual del cache: si crece monotónicamente, el bug está activo
SELECT id, count, jsonb_array_length(fires) AS array_len, fetched_at
FROM fires_cache
WHERE id = 1;

-- 3. ¿Hay duplicados por (lat, lng, acq_date, acq_time)?
WITH expanded AS (
  SELECT
    f->>'latitude'  AS lat,
    f->>'longitude' AS lng,
    f->>'acqDate'   AS acq_date,
    f->>'acqTime'   AS acq_time
  FROM fires_cache, jsonb_array_elements(fires) AS f
  WHERE id = 1
)
SELECT
  COUNT(*)                                                AS total_rows,
  COUNT(DISTINCT (lat, lng, acq_date, acq_time))          AS unique_rows,
  COUNT(*) - COUNT(DISTINCT (lat, lng, acq_date, acq_time)) AS duplicates
FROM expanded;
