-- whi-aviso-alta-con-provincia.sql
-- Each new subscriber is announced in the GrowingBay Ops Telegram chat, with
-- city and province — the same chat where every other product's sign-ups land.
-- Additive only (new nullable column + new function + new trigger). Apply with explicit OK.
--
-- WHY THROUGH /api/alta AND NOT TELEGRAM DIRECTLY: the other five databases
-- already announce sign-ups by POSTing to whitebay-ops `/api/alta`, which owns
-- the bot and the message format. The bot token there is `sensitive` in Vercel
-- and cannot be copied into this vault anyway.
--
-- ONLY NEW SUBSCRIBERS (decided by Seba, 2026-09-28): the bot saves with
-- INSERT ... ON CONFLICT DO UPDATE, and an AFTER INSERT row trigger fires only
-- when the row is actually inserted. Someone changing city is an UPDATE and is
-- not announced — no extra logic needed for that.
--
-- ORDER MATTERS: apply this BEFORE deploying the bot code that writes
-- `province`. The other way round, the upsert would name a column that does not
-- exist and the subscription itself would fail.

-- The secrets are NOT in the repository. `ops_altas_url` and `ops_altas_token`
-- are loaded by hand into this database's vault (same values as the other five
-- bases). This script does not create them: it REQUIRES them and fails loud if
-- they are missing. An empty secret created "just in case" would pass every
-- check and send nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ops_altas_url')
     OR NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ops_altas_token') THEN
    RAISE EXCEPTION 'Faltan ops_altas_url y/o ops_altas_token en la boveda: son la direccion y la llave de /api/alta en whitebay-ops.';
  END IF;
END $$;

-- 1. The province was geocoded on every subscription and then thrown away:
--    only city_name was saved. Nullable because the 7 existing rows have none.
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS province TEXT;

-- 2. The announcement.
CREATE OR REPLACE FUNCTION public.notify_new_subscriber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
declare _url text; _token text; _lugar text;
begin
  select decrypted_secret into _url   from vault.decrypted_secrets where name = 'ops_altas_url';
  select decrypted_secret into _token from vault.decrypted_secrets where name = 'ops_altas_token';
  if _url is null or _token is null then
    raise warning 'aviso de alta (alertaforestal): faltan ops_altas_url / ops_altas_token en la boveda';
    return new;
  end if;

  -- A subscriber is an anonymous Telegram chat: no name, no email. The place is
  -- the one thing this sign-up has to say.
  _lugar := nullif(concat_ws(', ', nullif(new.city_name, ''), nullif(new.province, '')), '');

  perform net.http_post(
    url     := _url,
    body    := jsonb_build_object(
                 'producto', 'alertaforestal',
                 'evento',   'alta',
                 'nombre',   'Suscriptor por Telegram',
                 'detalle',  '📍 ' || coalesce(_lugar, 'sin ubicación')),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _token),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  -- Never let the announcement break a subscription.
  raise warning 'aviso de alta (alertaforestal) fallo para %: %', new.chat_id, sqlerrm;
  return new;
end;
$function$;

-- The function is only meant to run as a trigger.
REVOKE EXECUTE ON FUNCTION public.notify_new_subscriber() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_new_subscriber_notify ON public.subscribers;
CREATE TRIGGER on_new_subscriber_notify
  AFTER INSERT ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_subscriber();
