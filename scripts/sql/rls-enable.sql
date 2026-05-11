-- Enable RLS en las 7 tablas que el advisor de Supabase flageaba.
--
-- Aplicar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).
--
-- Es seguro porque CLARA usa exclusivamente SUPABASE_SERVICE_ROLE_KEY del
-- lado servidor (src/lib/supabase.ts + src/app/(main)/page.tsx). El service
-- role bypassea RLS por diseño de Supabase. anon/authenticated quedan
-- bloqueados, que es lo deseado: ninguna de estas tablas debería ser
-- consultable desde el browser sin pasar por nuestro backend.

ALTER TABLE public.subscribers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_alerted_fires     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fires_cache          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._fires_sync_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fires_daily_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lightning_alerted    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goes_preliminary     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goes_alerted         ENABLE ROW LEVEL SECURITY;

-- Verificación: las tablas deben aparecer con rls_enabled = true
SELECT relname AS table_name,
       relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'subscribers', 'ai_alerted_fires', 'fires_cache', '_fires_sync_state',
  'fires_daily_history', 'lightning_alerted', 'goes_preliminary', 'goes_alerted'
)
ORDER BY relname;
