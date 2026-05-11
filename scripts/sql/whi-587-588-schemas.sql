-- WHI-587 + WHI-588 — schemas para Dashboard interno + fireman role.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
-- (Las migraciones ya fueron aplicadas vía MCP en sesión 2026-05-11.)

-- ─── WHI-588 — fireman role + invite codes ───────────────────────────
ALTER TABLE subscribers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'civilian'
    CHECK (role IN ('civilian','fireman','admin')),
  ADD COLUMN IF NOT EXISTS cuartel_name TEXT;

CREATE TABLE IF NOT EXISTS fireman_codes (
  code TEXT PRIMARY KEY,
  cuartel_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER  -- NULL = unlimited
);
ALTER TABLE fireman_codes ENABLE ROW LEVEL SECURITY;

-- Para distribuir un código a un cuartel piloto:
-- INSERT INTO fireman_codes (code, cuartel_name, max_uses)
-- VALUES ('BBLANCA-2026', 'Bomberos Voluntarios de Bahía Blanca', 20);

-- ─── WHI-587 — bot commands log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_commands_log (
  id BIGSERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  command TEXT NOT NULL,
  args TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bot_commands_log_recent_idx
  ON bot_commands_log (created_at DESC);
CREATE INDEX IF NOT EXISTS bot_commands_log_command_idx
  ON bot_commands_log (command, created_at DESC);
ALTER TABLE bot_commands_log ENABLE ROW LEVEL SECURITY;

-- ─── Owner setup (manual, una sola vez) ───────────────────────────────
-- Crear el user del dashboard en Supabase Auth:
--   Dashboard → Authentication → Users → Add user
--   Email: soysebalopez@gmail.com
--   Password: (setealo ahí, NO en código)
--   Auto Confirm User: SI (skip email verification)
--
-- Después correr este SQL para deshabilitar signups públicos:
-- UPDATE auth.config SET enable_signup = false;
-- (En proyecto nuevo no hace falta — el setting está en Auth → Providers → Email → Disable signups.)
