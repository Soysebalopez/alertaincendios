-- whi-fwi-prevention-alerts.sql
-- Opt-in column + dedup tables for FWI prevention alerts via Telegram.
-- Spec: docs/superpowers/specs/2026-06-23-fwi-prevention-alerts-design.md
-- Plan: docs/superpowers/plans/2026-06-23-fwi-prevention-alerts.md
-- Additive only (new column with default + two new tables). Apply with explicit OK.

-- 1. Opt-in mode on subscribers
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS prevention_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (prevention_mode IN ('off','alerts','daily'));

-- 2. Episode dedup for crossing alerts.
--    One row per (zone, sub) while the zone stays at alto+; alerted_class holds
--    the episode peak. Deleted when the zone drops below alto (episode ends).
CREATE TABLE IF NOT EXISTS public.prevention_alerted (
  zone_id       TEXT NOT NULL,
  chat_id       BIGINT NOT NULL,
  alerted_class TEXT NOT NULL,
  alerted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, chat_id)
);
ALTER TABLE public.prevention_alerted ENABLE ROW LEVEL SECURITY;

-- 3. Daily-briefing idempotency (one briefing per sub per day).
CREATE TABLE IF NOT EXISTS public.prevention_briefing_sent (
  chat_id   BIGINT NOT NULL,
  sent_date DATE NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, sent_date)
);
ALTER TABLE public.prevention_briefing_sent ENABLE ROW LEVEL SECURITY;

-- 4. Cron job: daily at 09:30 UTC (06:30 ART), ~30 min after fire-danger-sync
--    (09:00 UTC), so the day's forecast is already in fire_danger. Same host as
--    the sibling fire-danger-sync cron. Apply with explicit OK.
SELECT cron.schedule(
  'prevention-alerts',
  '30 9 * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/prevention-alerts?secret=' || clara_cron_secret(),
      timeout_milliseconds := 120000
    )$$
);
