-- La clave pública (anon) y los usuarios logueados (authenticated) podían
-- VACIAR la tabla de suscriptores con TRUNCATE: ese comando no pasa por RLS
-- (ver whi-907-wind.sql). La app nunca lo usa; sólo el servicio (service_role)
-- lo conserva. No toca ninguna fila ni ninguna policy. OK de Seba, 2026-09-28.
revoke truncate on table public.subscribers from anon, authenticated;
