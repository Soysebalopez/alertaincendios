-- Fire-danger (FWI) engine — daily pg_cron schedule.
--
-- APPLY GATED: present this file and wait for explicit OK before running it
-- against the shared production project (qmzuwnilehldvobjsbcs). Apply AFTER
-- whi-fwi-schema.sql and AFTER configuring the endpoint URL:
--
--   ALTER DATABASE postgres SET app.fire_danger_sync_url
--     = 'https://alertaforestal.org/api/fire-danger-sync';
--
-- (CRON_SECRET is available via clara_cron_secret() since WHI-586.)
-- Pattern mirrors scripts/sql/whi-753-cron.sql. search_path is pinned from the
-- start per the 2026-06-17 security hardening (avoids a function_search_path
-- advisor warning).

CREATE OR REPLACE FUNCTION trigger_fire_danger_sync()
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_url    TEXT := current_setting('app.fire_danger_sync_url', true);
  v_secret TEXT := clara_cron_secret();
  v_request_id BIGINT;
BEGIN
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'app.fire_danger_sync_url not configured';
  END IF;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'clara_cron_secret() returned NULL';
  END IF;

  -- pg_net is async; the Python endpoint writes straight to fire_danger.
  -- Generous timeout: spin-up of a brand-new zone replays ~30 historical days
  -- plus a 16-day forecast fetch per zone.
  SELECT net.http_get(
    url := v_url || '?secret=' || v_secret,
    timeout_milliseconds := 290000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Schedule: 09:00 UTC daily = 06:00 ART. Once a day is enough — the forecast
-- horizon is 16 days and the danger class moves on a daily cadence.
SELECT cron.schedule(
  'fire-danger-sync',
  '0 9 * * *',
  $$SELECT trigger_fire_danger_sync();$$
);

-- Verify it scheduled:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'fire-danger-sync';

-- Run it manually the first time (seeds the empty zones):
--   SELECT trigger_fire_danger_sync();

-- Unschedule (if it must be redone):
--   SELECT cron.unschedule('fire-danger-sync');
