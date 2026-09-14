-- WHI-907 parte 4 — viento observado (METAR del aeropuerto) y pronosticado
-- (SMN WRF 4 km) para Bahía Blanca.
--
-- ⚠️ NO APLICAR sin que Seba vea este SQL y dé OK (checkpoint C2 del plan
--    docs/superpowers/plans/2026-09-14-bahia-blanca-nivel-1.md).
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs, compartido con SatAI).
--
-- Mismo criterio que satellite_tles: RLS activo y SIN policies para anon ni
-- authenticated. Leen y escriben sólo el service role (crons y rutas de
-- servidor); si una página necesita los datos, se exponen por una ruta /api.
--
-- REVOKE explícito: RLS no gobierna TRUNCATE, y los default privileges de
-- Supabase se lo otorgan a anon/authenticated en `public`. Sin el REVOKE, la
-- clave pública del sitio podría vaciar estas tablas aunque RLS esté activo.

CREATE TABLE IF NOT EXISTS wind_observations (
  station       TEXT             NOT NULL,          -- código OACI, p. ej. 'SAZB'
  observed_at   TIMESTAMPTZ      NOT NULL,
  wind_from_deg DOUBLE PRECISION,                   -- NULL = viento variable (VRB)
  wind_kmh      DOUBLE PRECISION NOT NULL,
  gust_kmh      DOUBLE PRECISION,
  variable      BOOLEAN          NOT NULL DEFAULT false,
  inserted_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  PRIMARY KEY (station, observed_at)
);
ALTER TABLE wind_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wind_observations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS wind_forecast (
  source        TEXT             NOT NULL,          -- 'smn-wrf'
  run_at        TIMESTAMPTZ      NOT NULL,          -- inicialización del modelo (00/12 UTC)
  valid_at      TIMESTAMPTZ      NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  wind_from_deg DOUBLE PRECISION NOT NULL,
  wind_kmh      DOUBLE PRECISION NOT NULL,
  temp_c        DOUBLE PRECISION,
  rh_pct        DOUBLE PRECISION,
  inserted_at   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  PRIMARY KEY (source, run_at, valid_at, lat, lng)
);
CREATE INDEX IF NOT EXISTS wind_forecast_valid_idx ON wind_forecast (valid_at);
ALTER TABLE wind_forecast ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wind_forecast FROM anon, authenticated;

-- Verificación posterior (correr DESPUÉS de aplicar; tiene que devolver 0 filas):
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND table_name IN ('wind_observations', 'wind_forecast')
--     AND grantee IN ('anon', 'authenticated');
--
-- Retención y crons (metar-sync cada hora, smn-wrf-sync 2 veces por día, purga)
-- se programan en el checkpoint C5, después del merge.
