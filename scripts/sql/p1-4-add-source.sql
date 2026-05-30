-- P1-4 (2026-05-30) — columna `source` en subscribers (attribution del alta).
-- Aplicado a prod como migración `add_subscribers_source`. Aditiva y nullable
-- (expand-then-migrate: el bot viejo no la referencia; el nuevo la setea).

ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS source text;
COMMENT ON COLUMN public.subscribers.source IS
  'Origen del alta (attribution): cuartel:<slug> / campaign:<slug> / null. Resuelto desde el payload del deep link /start (first-write-wins).';

-- Convención de deep links (para el outreach — generá uno por cuartel/canal):
--   Cuartel:  https://t.me/alertaforestal_bot?start=cuartel-<slug>   → source = cuartel:<slug>
--   Campaña:  https://t.me/alertaforestal_bot?start=src-<slug>       → source = campaign:<slug>
--   (radio/QR/posteo, ej. src-radio-tdf, src-qr-ushuaia)
-- El bot loguea el payload en bot_commands_log y upsertSubscriber lo resuelve a
-- `source` la primera vez que el usuario se suscribe (no pisa origen existente).
--
-- NOTA: esto es solo attribution. La auto-promoción a fireman desde un token de
-- cuartel (deep link que promueve sin /soybombero) queda para P4 (requiere la
-- tabla cuarteles + tokens). Hoy el bombero sigue activando con /soybombero CÓDIGO.