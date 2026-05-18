-- WHI-753 — pg_cron schedule para refrescar TLEs de satélites diariamente.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs)
-- DESPUÉS de whi-753-satellite-tles.sql y de configurar:
--
--   ALTER DATABASE postgres SET app.satellites_sync_tles_url
--     = 'https://alertaincendios.vercel.app/api/satellites/sync-tles';
--
-- (CRON_SECRET ya está disponible vía clara_cron_secret() desde WHI-586.)

CREATE OR REPLACE FUNCTION trigger_satellites_sync_tles()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_url    TEXT := current_setting('app.satellites_sync_tles_url', true);
  v_secret TEXT := clara_cron_secret();
  v_request_id BIGINT;
BEGIN
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'app.satellites_sync_tles_url not configured';
  END IF;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'clara_cron_secret() returned NULL';
  END IF;

  SELECT net.http_get(
    url := v_url || '?secret=' || v_secret,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Schedule: 4:30 UTC diario = 1:30 ART. Ventana de muy bajo tráfico, y CelesTrak
-- publica TLEs frescos varias veces al día — uno por día es suficiente para
-- mantener error de propagación <1 km a 24h vista.
SELECT cron.schedule(
  'satellites-sync-tles',
  '30 4 * * *',
  $$SELECT trigger_satellites_sync_tles();$$
);

-- Para correrlo manualmente la primera vez (popular los seeds vacíos):
--   SELECT trigger_satellites_sync_tles();
