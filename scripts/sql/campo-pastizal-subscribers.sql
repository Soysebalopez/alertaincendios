-- Capa "campo y pastizal" (Seba, 2026-09-28).
--
-- El bot suma avisos de incendios de pastizal, campo, arbustal y quemas
-- agrícolas FUERA de las 7 zonas de bosque, en toda Argentina, sin fuentes
-- industriales, a 20 km del suscriptor y sólo fuegos intensos (FRP > 10 MW).
-- Viene PRENDIDA para todos; cada suscriptor la puede apagar desde el bot.
--
-- SÓLO AGREGA una columna. Ninguna fila cambia de sentido: el valor por
-- defecto `true` es exactamente "prendida para todos". Misma forma que
-- `lightning_enabled` (not null, default true). RLS y permisos no cambian.

alter table public.subscribers
  add column if not exists campo_enabled boolean not null default true;

comment on column public.subscribers.campo_enabled is
  'Avisos de incendios de campo/pastizal fuera de las zonas de bosque (28/9). Default true; se apaga con /campo o el menú de preferencias.';
