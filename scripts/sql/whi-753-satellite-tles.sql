-- WHI-753 — Cache de TLEs (Two-Line Elements) para satélites VIIRS.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Diseño:
--   - 1 row por NORAD ID. Se refresca diariamente vía pg_cron + /api/satellites/sync-tles.
--   - Si fetched_at > 7 días, la lib computeNextPassOverArgentina() ignora ese sat
--     (TLEs envejecen ~km/día — propagar con datos viejos da resultados sin sentido).
--   - Seed inicial con line1/line2 vacíos y fetched_at epoch → el cron los llena.

CREATE TABLE IF NOT EXISTS satellite_tles (
  norad_id   INT PRIMARY KEY,
  name       TEXT NOT NULL,
  line1      TEXT NOT NULL,
  line2      TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed VIIRS-equipped satellites (NASA FIRMS data sources)
INSERT INTO satellite_tles (norad_id, name, line1, line2, fetched_at)
VALUES
  (37849, 'SUOMI NPP', '', '', '1970-01-01T00:00:00Z'),
  (43013, 'NOAA 20',   '', '', '1970-01-01T00:00:00Z'),
  (54234, 'NOAA 21',   '', '', '1970-01-01T00:00:00Z')
ON CONFLICT (norad_id) DO NOTHING;

ALTER TABLE satellite_tles ENABLE ROW LEVEL SECURITY;

-- Service role bypassea RLS. anon/auth no necesitan acceso directo a esta tabla
-- (los datos se exponen vía /api/satellites/* si hace falta en el futuro).
