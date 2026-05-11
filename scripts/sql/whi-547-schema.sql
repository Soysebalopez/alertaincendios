-- WHI-547 — Schema para tracking de alertas preliminares GOES.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Diseño:
--   - 1 row por (detección preliminar GOES × suscriptor alertado)
--   - Si después llega FIRMS y confirma → set confirmed_sent_at + firms_fire_key
--   - Si nunca confirma en 2h → quedará como preliminary sin confirmed (v1 no
--     envía mensaje de "descartada" para no sumar ruido)
--
-- Retención: similar a goes_preliminary, follow-up agregar pg_cron daily prune.

CREATE TABLE IF NOT EXISTS goes_alerted (
  id                   BIGSERIAL PRIMARY KEY,
  goes_id              BIGINT NOT NULL,
  chat_id              BIGINT NOT NULL,
  preliminary_sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_sent_at    TIMESTAMPTZ,
  firms_fire_key       TEXT,
  CONSTRAINT goes_alerted_unique UNIQUE (goes_id, chat_id),
  CONSTRAINT goes_alerted_goes_fk FOREIGN KEY (goes_id)
    REFERENCES goes_preliminary(id) ON DELETE CASCADE
);

-- "Alertas recientes" (para evitar re-alertar el mismo foco)
CREATE INDEX IF NOT EXISTS goes_alerted_recent_idx
  ON goes_alerted (preliminary_sent_at DESC);

-- "Preliminaries pendientes de confirmación" (para matching desde /api/alerts)
CREATE INDEX IF NOT EXISTS goes_alerted_pending_confirmation_idx
  ON goes_alerted (chat_id, preliminary_sent_at DESC)
  WHERE confirmed_sent_at IS NULL;

COMMENT ON TABLE goes_alerted IS
  'Tracking WHI-547: cada vez que mandamos una alerta preliminar GOES a un '
  'subscriber, dejamos un row. Si después FIRMS confirma el mismo foco, '
  'completamos confirmed_sent_at + firms_fire_key.';
