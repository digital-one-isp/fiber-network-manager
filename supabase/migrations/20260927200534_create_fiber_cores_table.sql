-- ============================================================
-- Migration: create_fiber_cores_table
-- Purpose: Individual core-level tracking within each fiber_cables entry
-- ============================================================

-- 1. Core status enum
create type public.core_status as enum ('free', 'used', 'damaged', 'reserved');

-- 2. Fiber cores table
-- Standard TIA/EIA-598 12-color code cycles for every 12 cores (1 buffer tube).
create table public.fiber_cores (
  id uuid primary key default gen_random_uuid(),
  cable_id uuid not null references public.fiber_cables(id) on delete cascade,
  core_number integer not null check (core_number > 0),
  tube_number integer not null default 1 check (tube_number > 0),
  color text not null,
  status public.core_status not null default 'free',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cable_id, core_number)
);

comment on table public.fiber_cores is 'Individual fiber cores within a cable; color follows TIA/EIA-598 12-color cycle per buffer tube';
comment on column public.fiber_cores.core_number is 'Absolute core number within the whole cable (1-based)';
comment on column public.fiber_cores.tube_number is 'Buffer tube group number; each tube holds up to 12 cores';

-- 3. Enable RLS
alter table public.fiber_cores enable row level security;

-- 4. Policies (same staff-based pattern)
create policy "fiber_cores_select_authenticated"
  on public.fiber_cores for select
  to authenticated
  using (true);

create policy "fiber_cores_insert_staff"
  on public.fiber_cores for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "fiber_cores_update_staff"
  on public.fiber_cores for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "fiber_cores_delete_admin_manager"
  on public.fiber_cores for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- 5. updated_at trigger
create trigger set_fiber_cores_updated_at
  before update on public.fiber_cores
  for each row execute function public.set_updated_at();

-- 6. Index for looking up cores by cable
create index fiber_cores_cable_id_idx on public.fiber_cores (cable_id);

-- 7. Function: auto-generate all cores (with correct colors) when a cable is created
create function public.generate_fiber_cores()
returns trigger
language plpgsql
as $$
declare
  colors text[] := array['Blue','Orange','Green','Brown','Slate','White','Red','Black','Yellow','Violet','Rose','Aqua'];
  i integer;
begin
  for i in 1..new.core_count loop
    insert into public.fiber_cores (cable_id, core_number, tube_number, color)
    values (
      new.id,
      i,
      ceil(i::numeric / 12),
      colors[((i - 1) % 12) + 1]
    );
  end loop;
  return new;
end;
$$;

create trigger on_fiber_cable_created
  after insert on public.fiber_cables
  for each row execute function public.generate_fiber_cores();
