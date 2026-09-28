-- ============================================================
-- Migration: create_fiber_tubes_table
-- Purpose: Track buffer tubes separately from cores, so each tube
--          can have its own color (standard tube color-coding) and
--          each core's tube_number can be freely reassigned by staff.
-- ============================================================

-- 1. Fiber tubes table
create table public.fiber_tubes (
  id uuid primary key default gen_random_uuid(),
  cable_id uuid not null references public.fiber_cables(id) on delete cascade,
  tube_number integer not null check (tube_number > 0),
  color text not null default 'Blue',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cable_id, tube_number)
);

comment on table public.fiber_tubes is 'Buffer tubes within a fiber cable; each tube has its own color, independent of its cores'' colors';

-- 2. Enable RLS
alter table public.fiber_tubes enable row level security;

create policy "fiber_tubes_select_authenticated"
  on public.fiber_tubes for select
  to authenticated
  using (true);

create policy "fiber_tubes_insert_staff"
  on public.fiber_tubes for insert
  to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "fiber_tubes_update_staff"
  on public.fiber_tubes for update
  to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "fiber_tubes_delete_admin_manager"
  on public.fiber_tubes for delete
  to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 3. updated_at trigger
create trigger set_fiber_tubes_updated_at
  before update on public.fiber_tubes
  for each row execute function public.set_updated_at();

-- 4. Index
create index fiber_tubes_cable_id_idx on public.fiber_tubes (cable_id);

-- 5. Update core auto-generation to also create the tube rows,
--    using the standard 12-color cycle for tube colors (independent
--    of the 6-color cycle used for core colors within a tube).
create or replace function public.generate_fiber_cores()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  core_colors text[] := array['Blue','Orange','Green','Brown','Slate','White'];
  tube_colors text[] := array['Blue','Orange','Green','Brown','Slate','White','Red','Black','Yellow','Violet','Rose','Aqua'];
  i integer;
  tube_count integer;
  t integer;
begin
  tube_count := ceil(new.core_count::numeric / 6);

  for t in 1..tube_count loop
    insert into public.fiber_tubes (cable_id, tube_number, color)
    values (new.id, t, tube_colors[((t - 1) % 12) + 1]);
  end loop;

  for i in 1..new.core_count loop
    insert into public.fiber_cores (cable_id, core_number, tube_number, color)
    values (
      new.id,
      i,
      ceil(i::numeric / 6),
      core_colors[((i - 1) % 6) + 1]
    );
  end loop;

  return new;
end;
$$;
