-- P0-4 (2026-05-30) — Cerrar exposición vía PostgREST (/rest/v1/rpc) de funciones
-- sensibles a la anon key (pública por diseño). Aplicado a prod como migración
-- `revoke_anon_execute_sensitive_rpcs` (Supabase project qmzuwnilehldvobjsbcs).
--
-- Hallazgo: get_advisors marcó clara_cron_secret(), clara_cron_health(),
-- consume_fireman_code() y whitebay_daily_metrics() como ejecutables por anon.
-- clara_cron_secret() devuelve el CRON_SECRET que autoriza TODOS los endpoints
-- de cron (incl. alertas a suscriptores) → cualquiera con la anon key podía leerlo.
--
-- Seguridad de la operación:
--   - Los pg_cron jobs corren como `postgres` (superusuario) → NO necesitan grant.
--   - El dashboard /health llama clara_cron_health() como `authenticated` → se CONSERVA.
--   - El bot llama consume_fireman_code() como `service_role` → se CONSERVA.
--   - whitebay_daily_metrics() se consume server-side con `service_role` → se CONSERVA.

-- Crítico: el secret. (Sin grant a PUBLIC; basta revocar anon + authenticated.)
REVOKE EXECUTE ON FUNCTION public.clara_cron_secret() FROM anon, authenticated;

-- Consumo de códigos fireman (bot usa service_role).
REVOKE EXECUTE ON FUNCTION public.consume_fireman_code(bigint, text) FROM anon, authenticated;

-- Health: tenía grant a PUBLIC. Revocar PUBLIC + anon; authenticated (dashboard) conserva grant explícito.
REVOKE EXECUTE ON FUNCTION public.clara_cron_health() FROM PUBLIC, anon;

-- Métricas Whitebay: sin caller anon/authenticated legítimo.
REVOKE EXECUTE ON FUNCTION public.whitebay_daily_metrics(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- Verificación esperada (has_function_privilege):
--   clara_cron_secret      → anon=f auth=f service=t
--   consume_fireman_code   → anon=f auth=f service=t
--   clara_cron_health      → anon=f auth=t service=t   (dashboard intacto)
--   whitebay_daily_metrics → anon=f auth=f service=t
