-- WHI-543 — Schema para alertas de tormenta seca.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

-- Suscriptores: opt-out por tipo. Default true = alertas de rayos activas.
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS lightning_enabled BOOLEAN NOT NULL DEFAULT true;

-- Tabla para rate-limit de alertas de rayos (1 cada 30 min por suscriptor).
CREATE TABLE IF NOT EXISTS lightning_alerted (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lightning_alerted_chat_recent_idx
  ON lightning_alerted (chat_id, alerted_at DESC);

-- Limpieza periódica (opcional): borrar registros viejos de >7 días para
-- mantener la tabla chica. Se puede agregar a pg_cron si se quiere.
-- DELETE FROM lightning_alerted WHERE alerted_at < now() - interval '7 days';
