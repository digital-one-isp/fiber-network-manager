-- ============================================================
-- Migration: update_fiber_core_generation_6_per_tube
-- Purpose: Switch fiber core auto-generation from 12-per-tube to
--          6-per-tube (6-fiber buffer tube standard), using the
--          first 6 colors of the TIA/EIA-598 cycle per tube.
--          Existing cables/cores are untouched; this only changes
--          generation for cables created from now on.
-- ============================================================

create or replace function public.generate_fiber_cores()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  colors text[] := array['Blue','Orange','Green','Brown','Slate','White'];
  i integer;
begin
  for i in 1..new.core_count loop
    insert into public.fiber_cores (cable_id, core_number, tube_number, color)
    values (
      new.id,
      i,
      ceil(i::numeric / 6),
      colors[((i - 1) % 6) + 1]
    );
  end loop;
  return new;
end;
$$;

comment on function public.generate_fiber_cores() is 'Auto-generates fiber cores for a new cable: 6 cores per buffer tube, cycling the first 6 TIA/EIA-598 colors (Blue, Orange, Green, Brown, Slate, White)';
