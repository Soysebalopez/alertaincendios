-- scripts/sql/whi-firms-map-key-config.sql
-- FIRMS MAP_KEY moved out of the SQL function body into _clara_config, so the
-- key is not embedded in pg_get_functiondef output and rotation is a one-row UPDATE.
-- APPLIED to prod (qmzuwnilehldvobjsbcs) on 2026-06-19 during the MAP_KEY-expiry
-- incident; this file versions it. The key VALUE is a secret — set it manually,
-- never commit it.

-- 1. Set the key (run manually with the real value; do NOT commit the value):
--    insert into public._clara_config (key, value, updated_at)
--    values ('firms_map_key', '<MAP_KEY>', now())
--    on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. Accessor (same pattern as clara_cron_secret):
create or replace function public.clara_firms_map_key()
returns text language sql security definer
set search_path = pg_catalog, public as $$
  select value from public._clara_config where key = 'firms_map_key';
$$;

-- 3. Fetch step reads the key from config instead of a literal:
create or replace function public.fires_sync_step1_fetch()
returns void language plpgsql
set search_path = pg_catalog, public as $$
  declare _req_id bigint;
  begin
    select net.http_get(
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/'
        || public.clara_firms_map_key()
        || '/VIIRS_SNPP_NRT/-73.6,-55.1,-53.6,-21.8/1',
      timeout_milliseconds := 30000
    ) into _req_id;
    update public._fires_sync_state set request_id = _req_id, requested_at = now() where id = 1;
  end;
$$;
