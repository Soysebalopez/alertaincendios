-- P1-6 (2026-05-30) — Programar /api/lightning-alerts en pg_cron.
-- Aplicado a prod como migración `schedule_lightning_alerts_cron`
-- (Supabase project qmzuwnilehldvobjsbcs).
--
-- Problema: el endpoint /api/lightning-alerts (WHI-543, alerta de tormenta
-- eléctrica seca — vector de ignición forestal) existía y el README lo listaba
-- como cron, pero NO había job en pg_cron: dependía de un crontab local en la
-- máquina del owner (sync-fires.sh). Para un servicio de seguridad, una alerta
-- que silenciosamente no corre es peligrosa.
--
-- Mismo patrón que los demás jobs (net.http_get + clara_cron_secret, timeout 60s).
-- Minutos OFFSET de todos los jobs existentes (fires :0/2/4/15/17/19/...,
-- goes :5/7/15/17/25/27/...) → :11,:26,:41,:56 para evitar solapamiento y los
-- picos de concurrencia (HTTP 503 FUNCTION_THROTTLED del plan Hobby).
-- Rate-limit real: 30 min/suscriptor (lightning_alerted.alerted_at).

SELECT cron.schedule(
  'lightning-alerts',
  '11,26,41,56 * * * *',
  $$SELECT net.http_get('https://alertaincendios.vercel.app/api/lightning-alerts?secret=' || clara_cron_secret(), timeout_milliseconds := 60000)$$
);

-- Para revertir:
--   SELECT cron.unschedule('lightning-alerts');
