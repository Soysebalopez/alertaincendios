-- WHI-XXX — fireman_codes hardening (post auditoría 2026-05-21).
--
-- Tres problemas que esta migración cierra:
--   1. TOCTTOU race: SELECT + check + UPDATE separados en handleSoyBombero
--      permitían a dos consumos concurrentes pasar ambos el límite max_uses.
--   2. Mismo chat_id consumiendo el mismo código N veces inflaba used_count
--      sin promover usuarios nuevos.
--   3. Sin CHECK, una bug en la app podía dejar used_count > max_uses sin
--      que la DB lo cazara.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
-- IDEMPOTENTE — se puede correr varias veces sin romper nada.

-- ─── 1. CHECK constraint defensa en profundidad ─────────────────────────
-- Si la app tiene un bug, la DB no permite estado inválido. Lo separamos
-- en transacción para que el ADD CONSTRAINT con NOT VALID pueda validar
-- las rows existentes después (si las hubiera) sin bloquear el deploy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fireman_codes_used_count_le_max'
  ) THEN
    ALTER TABLE public.fireman_codes
      ADD CONSTRAINT fireman_codes_used_count_le_max
      CHECK (max_uses IS NULL OR used_count <= max_uses)
      NOT VALID;

    -- Validamos rows existentes. Si alguna estuviera ya por encima del límite
    -- (efecto del bug) este VALIDATE falla y avisa, para limpiar a mano antes.
    ALTER TABLE public.fireman_codes
      VALIDATE CONSTRAINT fireman_codes_used_count_le_max;
  END IF;
END $$;

-- ─── 2. Tabla de audit trail por usuario+código ─────────────────────────
-- PK compuesto (chat_id, code) impide que el mismo usuario consuma el mismo
-- código dos veces. La RPC abajo usa ON CONFLICT DO NOTHING para detectar
-- el caso y devolver un error legible en lugar de fallar con SQLSTATE 23505.
CREATE TABLE IF NOT EXISTS public.fireman_code_usage (
  chat_id BIGINT NOT NULL,
  code TEXT NOT NULL,
  cuartel_name TEXT NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, code),
  FOREIGN KEY (code) REFERENCES public.fireman_codes(code) ON DELETE CASCADE
);
ALTER TABLE public.fireman_code_usage ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fireman_code_usage_code_idx
  ON public.fireman_code_usage (code, used_at DESC);

-- ─── 3. RPC atómica de consumo ──────────────────────────────────────────
-- Toda la lógica de promoción civilian → fireman vive acá. Garantías:
--   a) El INSERT en fireman_code_usage falla si (chat_id, code) ya existe
--      → respuesta "already_used".
--   b) El UPDATE de fireman_codes tiene el guard `used_count < max_uses` en
--      el WHERE — si otra transacción concurrente alcanzó el límite primero,
--      el UPDATE no actualiza nada → respuesta "exhausted".
--   c) Subscribers update solo corre si los dos anteriores tuvieron éxito.
--   d) Todo dentro de una transacción implícita de la función.
--
-- Devuelve:
--   { status: 'ok' | 'not_found' | 'exhausted' | 'already_used',
--     cuartel_name: text | null }
CREATE OR REPLACE FUNCTION public.consume_fireman_code(
  p_chat_id BIGINT,
  p_code TEXT
)
RETURNS TABLE (status TEXT, cuartel_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cuartel TEXT;
  v_max_uses INTEGER;
  v_existing INTEGER;
BEGIN
  -- 1. ¿Existe el código?
  SELECT fc.cuartel_name, fc.max_uses
    INTO v_cuartel, v_max_uses
  FROM public.fireman_codes fc
  WHERE fc.code = p_code;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- 2. ¿Este chat_id ya consumió este código antes? Rechazar con mensaje
  --    específico para que el bot pueda decir "ya estás registrado".
  SELECT 1 INTO v_existing
  FROM public.fireman_code_usage
  WHERE chat_id = p_chat_id AND code = p_code;

  IF FOUND THEN
    RETURN QUERY SELECT 'already_used'::TEXT, v_cuartel;
    RETURN;
  END IF;

  -- 3. Intentar consumir el slot. El WHERE incluye el guard de max_uses,
  --    así que dos requests concurrentes no pueden pasar ambos: postgres
  --    serializa los UPDATEs sobre la misma row con un row-level lock
  --    implícito; el segundo ve el nuevo used_count.
  UPDATE public.fireman_codes
     SET used_count = used_count + 1
   WHERE code = p_code
     AND (max_uses IS NULL OR used_count < max_uses);

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'exhausted'::TEXT, v_cuartel;
    RETURN;
  END IF;

  -- 4. Registrar el uso (PK falla si concurrente — fallback defensivo).
  BEGIN
    INSERT INTO public.fireman_code_usage (chat_id, code, cuartel_name)
    VALUES (p_chat_id, p_code, v_cuartel);
  EXCEPTION WHEN unique_violation THEN
    -- Otra transacción se nos adelantó con el mismo chat_id+code. Como ya
    -- incrementamos used_count, lo deshacemos para no cobrar dos veces.
    UPDATE public.fireman_codes
       SET used_count = used_count - 1
     WHERE code = p_code;
    RETURN QUERY SELECT 'already_used'::TEXT, v_cuartel;
    RETURN;
  END;

  -- 5. Promover al subscriber.
  UPDATE public.subscribers
     SET role = 'fireman',
         cuartel_name = v_cuartel
   WHERE chat_id = p_chat_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_cuartel;
END;
$$;

-- service_role la invoca desde el route handler.
REVOKE ALL ON FUNCTION public.consume_fireman_code(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_fireman_code(BIGINT, TEXT) TO service_role;

-- ─── Smoke test (no destructivo) ────────────────────────────────────────
-- Después de aplicar:
--   SELECT * FROM public.consume_fireman_code(999999, 'INEXISTENTE');
--   → status='not_found', cuartel_name=NULL
--
-- Si querés probar el camino feliz contra un código real, hacelo con un
-- chat_id de testing (no uno de un suscriptor real, porque queda registrado
-- en fireman_code_usage). Para limpiar el test:
--   DELETE FROM fireman_code_usage WHERE chat_id = <test_chat_id>;
--   UPDATE fireman_codes SET used_count = used_count - 1 WHERE code = '...';
