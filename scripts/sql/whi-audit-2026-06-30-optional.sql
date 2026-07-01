-- Optional DB migrations from the 2026-06-30 platform audit.
-- These are NOT applied automatically — they require running against the
-- Supabase project by hand (the audit code changes work without them; these
-- close two low-impact races fully). Review before applying.

-- ─────────────────────────────────────────────────────────────────────────
-- M5 — lightning_alerted: close the SELECT-then-INSERT dedup race.
-- A UNIQUE constraint on (chat_id, alert window) lets the insert be an atomic
-- claim (ON CONFLICT) instead of check-then-write. We bucket by the 30-min
-- rate-limit window via date_trunc on a generated column.
-- ─────────────────────────────────────────────────────────────────────────
-- Option A (simplest): one alert per chat per 30-min slot, enforced by a
-- generated bucket column + unique index. Adjust the interval if the cron
-- cadence changes.
alter table public.lightning_alerted
  add column if not exists slot_30m timestamptz
  generated always as (date_bin('30 minutes', alerted_at, 'epoch')) stored;

create unique index if not exists lightning_alerted_chat_slot_uniq
  on public.lightning_alerted (chat_id, slot_30m);

-- After applying, the route can switch to:
--   insert ... on conflict (chat_id, slot_30m) do nothing
-- and treat a conflict as "already alerted this window".

-- ─────────────────────────────────────────────────────────────────────────
-- M8 — atomic lightning_enabled toggle (avoids read-modify-write race when a
-- user taps /rayos and the preferences button near-simultaneously).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.toggle_lightning(p_chat_id bigint)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.subscribers
     set lightning_enabled = not coalesce(lightning_enabled, true)
   where chat_id = p_chat_id
  returning lightning_enabled;
$$;

-- After applying, the bot can call:
--   const { data } = await db.rpc("toggle_lightning", { p_chat_id: chatId });
-- and use `data` as the new state instead of read-modify-write.
