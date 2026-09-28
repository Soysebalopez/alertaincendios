-- La clave pública (anon) y los usuarios logueados (authenticated) podían
-- VACIAR estas tablas con TRUNCATE, que no pasa por RLS. La app nunca lo usa
-- (verificado: ningún TRUNCATE en src/); service_role y postgres lo conservan.
-- No toca filas ni policies. Completa lo de subscribers (mismo día).
-- OK de Seba, 2026-09-28. Lista sacada de la base, no escrita a mano.
revoke truncate on table public._clara_config, public._fires_sync_state, public.ai_alerted_fires, public.alerted_fires, public.bot_commands_log, public.danger_zones, public.feedback, public.fire_danger, public.fire_danger_state, public.fires_cache, public.fires_daily_history, public.goes_alerted, public.goes_preliminary, public.goes_sync_runs, public.lightning_alerted, public.prevention_alerted, public.prevention_briefing_sent, public.satellite_tles, public.subscriptions from anon, authenticated;
