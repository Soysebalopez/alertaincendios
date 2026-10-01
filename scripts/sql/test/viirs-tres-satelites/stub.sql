-- Doble mínimo de lo que whi-viirs-tres-satelites.sql toca en producción.
-- Lo usa run.sh; los datos son inventados salvo el formato del CSV (real, 2026-10-01).
create schema net;
create table net._http_response (id bigint primary key, status_code int, content text, error_msg text);
create table net._queue (id bigserial primary key, url text);
create function net.http_get(url text, timeout_milliseconds int default 5000) returns bigint language sql as
$$ insert into net._queue(url) values (url) returning id $$;
create table public._clara_config (key text primary key, value text, updated_at timestamptz);
insert into _clara_config values ('firms_map_key','SECRETKEY',now());
create function public.clara_firms_map_key() returns text language sql as $$ select value from _clara_config where key='firms_map_key' $$;
create table public.fires_cache (id int primary key, fires jsonb, count int, fetched_at timestamptz);
create table public._fires_sync_state (id int primary key, request_id bigint, requested_at timestamptz);
insert into _fires_sync_state values (1, null, null);
-- caché viejo: dos focos de Suomi-NPP sin campo satellite (como hoy en prod)
insert into fires_cache values (1, '[{"latitude":-40,"longitude":-70,"acqDate":"2026-09-30","acqTime":"1800","frp":3,"confidence":"n","type":0,"brightness":300},{"latitude":-41,"longitude":-71,"acqDate":"2026-09-30","acqTime":"1800","frp":3,"confidence":"n","type":0,"brightness":300}]', 2, now() - interval '15 min');
