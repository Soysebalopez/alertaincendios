-- Fire-danger (FWI) engine — daily pg_cron schedule.
--
-- Applied 2026-06-18 to the shared production project (qmzuwnilehldvobjsbcs).
-- Pattern mirrors the goes-sync / goes-alerts jobs: a single net.http_get with
-- the URL inline and the secret from clara_cron_secret() — no GUC, no trigger
-- function. Uses the alertaincendios.vercel.app alias because the apex
-- alertaforestal.org 307-redirects to www.alertaforestal.org and pg_net does
-- not follow redirects.
--
-- Apply AFTER whi-fwi-schema.sql and AFTER the endpoint is live in production.

select cron.schedule(
  'fire-danger-sync',
  '0 9 * * *',  -- 09:00 UTC = 06:00 ART, daily
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/fire-danger-sync?secret=' || clara_cron_secret(),
      timeout_milliseconds := 290000
    )$$
);

-- Verify it scheduled and is active:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'fire-danger-sync';

-- Trigger manually (idempotent — safe to re-run any time; on_conflict upserts):
-- select net.http_get(
--   'https://alertaincendios.vercel.app/api/fire-danger-sync?secret=' || clara_cron_secret(),
--   timeout_milliseconds := 290000
-- );

-- Inspect the HTTP result of a manual/cron run:
-- select status_code, content::text, created from net._http_response order by created desc limit 5;

-- Unschedule (if it must be redone):
-- select cron.unschedule('fire-danger-sync');
