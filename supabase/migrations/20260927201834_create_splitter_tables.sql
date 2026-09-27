-- ============================================================
-- Migration: create_splitter_tables
-- Purpose: Optical splitters and their individual ports.
--          Supports two kinds of splitters:
--          - Symmetric PON splitters (1:2, 1:4 ... 1:64) - N equal-power ports
--          - Asymmetric tap splitters (5:95, 10:90, 15:85, 20:80, 30:70,
--            40:60, 50:50) - 2 ports with unequal power split, used for
--            monitoring/CATV taps
-- ============================================================

-- 1. Splitter ratio enum
create type public.splitter_ratio as enum (
  '1:2', '1:4', '1:8', '1:16', '1:32', '1:64',
  '5:95', '10:90', '15:85', '20:80', '30:70', '40:60', '50:50'
);

-- 2. Splitters table
create table public.splitters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ratio public.splitter_ratio not null default '1:8',
  tg_box_id uuid references public.tg_boxes(id) on delete set null,
  input_core_id uuid references public.fiber_cores(id) on delete set null,
  latitude double precision,
  longitude double precision,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (input_core_id)
);

comment on table public.splitters is 'Optical splitters (symmetric PON or asymmetric tap); may sit inside a tg_box or standalone in the field (own lat/lng)';
comment on column public.splitters.input_core_id is 'The single fiber core feeding this splitter';
comment on column public.splitters.ratio is 'Symmetric PON ratio (1:N = N equal ports) or asymmetric tap ratio (X:Y where X+Y=100 = 2 unequal ports)';

-- 3. Splitter ports table
create table public.splitter_ports (
  id uuid primary key default gen_random_uuid(),
  splitter_id uuid not null references public.splitters(id) on delete cascade,
  port_number integer not null check (port_number > 0),
  power_percent numeric(5, 2),
  status public.core_status not null default 'free',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (splitter_id, port_number)
);

comment on table public.splitter_ports is 'Individual output ports of a splitter; each free port can later connect to one customer drop cable';
comment on column public.splitter_ports.power_percent is 'Approx. % of optical power this port carries (relevant for asymmetric tap splitters)';

-- 4. Enable RLS
alter table public.splitters enable row level security;
alter table public.splitter_ports enable row level security;

-- 5. Policies: splitters
create policy "splitters_select_authenticated"
  on public.splitters for select
  to authenticated
  using (true);

create policy "splitters_insert_staff"
  on public.splitters for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splitters_update_staff"
  on public.splitters for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splitters_delete_admin_manager"
  on public.splitters for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 6. Policies: splitter_ports
create policy "splitter_ports_select_authenticated"
  on public.splitter_ports for select
  to authenticated
  using (true);

create policy "splitter_ports_insert_staff"
  on public.splitter_ports for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splitter_ports_update_staff"
  on public.splitter_ports for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splitter_ports_delete_admin_manager"
  on public.splitter_ports for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 7. updated_at triggers
create trigger set_splitters_updated_at
  before update on public.splitters
  for each row execute function public.set_updated_at();

create trigger set_splitter_ports_updated_at
  before update on public.splitter_ports
  for each row execute function public.set_updated_at();

-- 8. Indexes
create index splitters_tg_box_id_idx on public.splitters (tg_box_id);
create index splitter_ports_splitter_id_idx on public.splitter_ports (splitter_id);

-- 9. Function: auto-generate ports based on the splitter's ratio.
--    - If ratio is "X:Y" and X + Y = 100 -> asymmetric tap: 2 ports,
--      with power_percent X and Y respectively.
--    - Otherwise ratio is "1:N" symmetric -> N equal ports, each
--      power_percent = 100/N.
create function public.generate_splitter_ports()
returns trigger
language plpgsql
as $$
declare
  first_num integer;
  second_num integer;
  i integer;
  equal_percent numeric(5, 2);
begin
  first_num := split_part(new.ratio::text, ':', 1)::integer;
  second_num := split_part(new.ratio::text, ':', 2)::integer;

  if first_num + second_num = 100 then
    -- Asymmetric tap splitter: exactly 2 ports with unequal power
    insert into public.splitter_ports (splitter_id, port_number, power_percent)
    values (new.id, 1, first_num);
    insert into public.splitter_ports (splitter_id, port_number, power_percent)
    values (new.id, 2, second_num);
  else
    -- Symmetric PON splitter: second_num equal ports
    equal_percent := round(100.0 / second_num, 2);
    for i in 1..second_num loop
      insert into public.splitter_ports (splitter_id, port_number, power_percent)
      values (new.id, i, equal_percent);
    end loop;
  end if;

  return new;
end;
$$;

create trigger on_splitter_created
  after insert on public.splitters
  for each row execute function public.generate_splitter_ports();
