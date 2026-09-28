-- Las tablas NUEVAS del esquema public nacían con TRUNCATE para anon y
-- authenticated (default privileges de Supabase). TRUNCATE no pasa por RLS:
-- la clave pública podía vaciar cualquier tabla nueva. Completa los REVOKE del
-- mismo día sobre las 20 tablas existentes. OK de Seba, 2026-09-28.
--
-- Aplicado para el rol que crea nuestras tablas (postgres: migraciones y
-- panel). Para supabase_admin Supabase no lo permite ("permission denied to
-- change default privileges"): es su rol interno y no crea tablas nuestras.
--
-- Verificado creando una tabla dentro de una transacción con ROLLBACK:
-- anon/authenticated sin TRUNCATE, anon conserva SELECT (lo gobierna RLS),
-- service_role conserva TRUNCATE, y la tabla de prueba no quedó.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
