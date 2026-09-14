-- WHI-907 checkpoint C4 — retiro de la función de bomberos de la base.
--
-- Aprobado por Seba y aplicado el 2026-09-14 en el proyecto qmzuwnilehldvobjsbcs.
-- Verificado después: tablas y función borradas; subscribers conserva sus 3 filas
-- y todas las columnas que usa el código.
-- Copia previa, verificada leyéndola: ~/whitebay-backups/alertaforestal-bomberos-2026-09-14/
-- (fuera de todo repositorio).
--
-- Estado medido antes de borrar: 1 código, 0 usos, 0 suscriptores con cuartel y
-- role = 'civilian' en los 3 suscriptores. Nada más dependía de esto: sin vistas,
-- policies, triggers ni índices, ninguna otra función y ningún código.
-- Todo en una transacción: si una línea falla, no se borra nada.

BEGIN;
DROP FUNCTION public.consume_fireman_code(bigint, text);
DROP TABLE public.fireman_code_usage;  -- 0 filas
DROP TABLE public.fireman_codes;       -- 1 fila: el único código, nunca usado
ALTER TABLE public.subscribers DROP COLUMN cuartel_name;  -- vacía en los 3
ALTER TABLE public.subscribers DROP COLUMN role;          -- 'civilian' en los 3
COMMIT;
