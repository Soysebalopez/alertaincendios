-- WHI-545 — Schema para detecciones preliminares GOES-19 FDC.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Diseño:
--   - Tabla flat de detecciones (1 row por pixel-fuego post-filtros)
--   - UNIQUE (lat, lng, scan_start) — idempotencia si /api/goes-sync corre 2 veces
--     sobre el mismo frame (ej. cron solapado, retry, etc.)
--   - scan_start: cuándo el satélite tomó el frame (campo time_coverage_start del NetCDF)
--   - detected_at: cuándo nosotros lo escribimos (audit)
--   - high_confidence: pre-calculado por el filtro (codes 10/11/13/30/31/33)
--
-- Retención: por ahora ninguna. ~7 detecciones × 144 scans/día = ~1000 rows/día,
-- ~365K rows/año. Pequeño. Si crece, agregar pg_cron diario que borre >90 días.

CREATE TABLE IF NOT EXISTS goes_preliminary (
  id           BIGSERIAL PRIMARY KEY,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  mask         INTEGER NOT NULL,
  mask_label   TEXT,
  frp_mw       REAL,
  area_m2      REAL,
  high_confidence BOOLEAN NOT NULL,
  scan_start   TIMESTAMPTZ NOT NULL,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goes_preliminary_unique UNIQUE (lat, lng, scan_start)
);

-- "Latest detections" — orden cronológico inverso por scan
CREATE INDEX IF NOT EXISTS goes_preliminary_scan_idx
  ON goes_preliminary (scan_start DESC);

-- Queries espaciales (cruce con suscriptores)
CREATE INDEX IF NOT EXISTS goes_preliminary_latlng_idx
  ON goes_preliminary (lat, lng);

-- Para depurar / audit cuándo el pipeline insertó qué
CREATE INDEX IF NOT EXISTS goes_preliminary_detected_idx
  ON goes_preliminary (detected_at DESC);

COMMENT ON TABLE goes_preliminary IS
  'Detecciones GOES-19 FDC (Fase 2 CLARA, WHI-545). Pre-filtradas por '
  '/api/goes-sync. Cada row es un foco preliminar a ~2km de resolución. '
  'Para alertas confirmadas usar fires_cache (FIRMS).';

COMMENT ON COLUMN goes_preliminary.mask IS
  'GOES FDC Mask code (Product User Guide rev 6). High-confidence: 10,11,13,30,31,33.';

COMMENT ON COLUMN goes_preliminary.scan_start IS
  'time_coverage_start del NetCDF — instante en que el satélite escaneó el pixel.';
