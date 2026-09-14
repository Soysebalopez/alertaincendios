-- WHI-907 parte 2 — rayos reales del GLM (GOES-19) sobre Argentina.
--
-- ⚠️ NO APLICAR sin que Seba vea este SQL y dé OK (checkpoint C2 del plan
--    docs/superpowers/plans/2026-09-14-bahia-blanca-nivel-1.md).
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs, compartido con SatAI).
--
-- Mismo criterio que whi-907-wind.sql: RLS activo, SIN policies para anon ni
-- authenticated, y REVOKE ALL explícito (RLS no gobierna TRUNCATE).

CREATE TABLE IF NOT EXISTS lightning_flashes (
  flash_at    TIMESTAMPTZ      NOT NULL,            -- inicio del flash (primer evento)
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  energy_j    DOUBLE PRECISION,
  area_m2     DOUBLE PRECISION,
  source      TEXT             NOT NULL DEFAULT 'glm-g19',
  inserted_at TIMESTAMPTZ      NOT NULL DEFAULT now(),
  PRIMARY KEY (flash_at, lat, lng)
);
CREATE INDEX IF NOT EXISTS lightning_flashes_at_idx ON lightning_flashes (flash_at DESC);
ALTER TABLE lightning_flashes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lightning_flashes FROM anon, authenticated;

-- Retención: 7 días alcanzan para cruzar un rayo con los focos de las horas
-- siguientes. OJO: esta función BORRA filas viejas (es la política de
-- retención); se agenda con pg_cron recién en el checkpoint C5.
CREATE OR REPLACE FUNCTION purge_old_lightning_flashes() RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS
  $$ DELETE FROM public.lightning_flashes WHERE flash_at < now() - interval '7 days' $$;
REVOKE ALL ON FUNCTION purge_old_lightning_flashes() FROM PUBLIC, anon, authenticated;

-- Verificación posterior (correr DESPUÉS de aplicar; tiene que devolver 0 filas):
--   SELECT table_name, grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'lightning_flashes'
--     AND grantee IN ('anon', 'authenticated');
