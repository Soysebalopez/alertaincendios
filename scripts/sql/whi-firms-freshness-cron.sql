-- scripts/sql/whi-firms-freshness-cron.sql
-- Every 15 min, hit the freshness monitor endpoint. Mirrors the fire-danger-sync
-- cron: net.http_get with the secret from clara_cron_secret(), apex alias because
-- pg_net does not follow the alertaforestal.org redirect.
-- APPLY GATED: run after the endpoint is deployed AND admin_chat_id is set.

select cron.schedule(
  'fires-freshness-monitor',
  '*/15 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/monitor/fires-freshness?secret=' || clara_cron_secret(),
      timeout_milliseconds := 30000
    )$$
);

-- Set the admin chat id (run manually; the chat id is not a secret but lives in config):
--   insert into public._clara_config (key, value, updated_at)
--   values ('admin_chat_id', '<CHAT_ID>', now())
--   on conflict (key) do update set value = excluded.value, updated_at = now();

-- Verify: select jobid, jobname, schedule, active from cron.job where jobname = 'fires-freshness-monitor';
-- Unschedule: select cron.unschedule('fires-freshness-monitor');
