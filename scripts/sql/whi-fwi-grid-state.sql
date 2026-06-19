-- scripts/sql/whi-fwi-grid-state.sql
-- FWI spatial precision — add per-point grid state to fire_danger_state.
-- ADDITIVE: a single nullable jsonb column. Existing rows and readers are
-- unaffected; the legacy scalar ffmc/dmc/dc columns (NOT NULL) remain.
--
-- APPLY GATED: present this file and wait for explicit OK before running it
-- against the shared production project (qmzuwnilehldvobjsbcs).

alter table public.fire_danger_state
  add column if not exists grid_state jsonb;

comment on column public.fire_danger_state.grid_state is
  'Per-point FWI state for the zone grid: array of {ffmc,dmc,dc} in grid order. '
  'Null = legacy single-point row.';
