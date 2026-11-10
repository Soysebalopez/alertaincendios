-- AlertaForestal: marcar a un suscriptor que BLOQUEÓ el bot.
--
-- Cuando Telegram devuelve 403 ("bot was blocked by the user") al enviar una
-- alerta, hasta ahora el código lo reportaba como error a Sentry y el cron
-- seguía reintentándole en cada ciclo (llamadas al pedo + ruido: eran ~59
-- eventos/mes de 1-2 personas que bloquearon el bot, no bugs).
--
-- Con esta columna, el código setea blocked_at = now() al recibir ese 403, y
-- los crons de alertas saltean a los bloqueados (filtran `blocked_at IS NULL`).
-- Así el bot deja de reintentar y esos "errores" esperables dejan de ir a Sentry.
--
-- Aditiva y segura: columna nullable, sin default, IF NOT EXISTS. NULL = activo.
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscribers.blocked_at IS
  'Fecha en que el usuario bloqueó el bot (Telegram 403). NULL = activo. Los crons de alertas saltean a los bloqueados.';
