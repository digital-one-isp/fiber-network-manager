-- ============================================================
-- Migration: make_tube_assignment_fully_manual
-- Purpose: Stop auto-grouping cores into tubes at creation time.
--          Tube count/size varies by cable (not a fixed formula),
--          so tubes are now created manually by staff, and each
--          core's tube_number is optional and freely editable.
-- ============================================================

-- 1. Allow cores to have no tube assigned yet
alter table public.fiber_cores
  alter column tube_number drop not null,
  alter column tube_number drop default;

drop index if exists fiber_cores_cable_id_idx;

-- Relax the check constraint to only apply when a tube_number is set
alter table public.fiber_cores
  drop constraint if exists fiber_cores_tube_number_check;
alter table public.fiber_cores
  add constraint fiber_cores_tube_number_check
  check (tube_number is null or tube_number > 0);

create index fiber_cores_cable_id_idx on public.fiber_cores (cable_id);

-- 2. Core generation no longer creates tubes or assigns tube_number;
--    it only creates the cores themselves with their color.
create or replace function public.generate_fiber_cores()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  core_colors text[] := array['Blue','Orange','Green','Brown','Slate','White'];
  i integer;
begin
  for i in 1..new.core_count loop
    insert into public.fiber_cores (cable_id, core_number, tube_number, color)
    values (
      new.id,
      i,
      null,
      core_colors[((i - 1) % 6) + 1]
    );
  end loop;
  return new;
end;
$$;
