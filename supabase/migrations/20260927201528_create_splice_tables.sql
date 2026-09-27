-- ============================================================
-- Migration: create_splice_tables
-- Purpose: Splice points (physical trays inside a TG box) and
--          splices (core-to-core fusion connections)
-- ============================================================

-- 1. Splice points: a tray/point inside a tg_box
create table public.splice_points (
  id uuid primary key default gen_random_uuid(),
  tg_box_id uuid not null references public.tg_boxes(id) on delete cascade,
  tray_number integer not null default 1 check (tray_number > 0),
  capacity integer not null default 12 check (capacity > 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tg_box_id, tray_number)
);

comment on table public.splice_points is 'Physical splice trays inside a TG/joint box';

-- 2. Splices: fusion connection between two fiber cores, held at a splice point
create table public.splices (
  id uuid primary key default gen_random_uuid(),
  splice_point_id uuid not null references public.splice_points(id) on delete cascade,
  core_a_id uuid not null references public.fiber_cores(id) on delete cascade,
  core_b_id uuid not null references public.fiber_cores(id) on delete cascade,
  splice_loss_db numeric(5, 2),
  spliced_at timestamptz not null default now(),
  spliced_by uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (core_a_id <> core_b_id),
  unique (core_a_id),
  unique (core_b_id)
);

comment on table public.splices is 'Fusion splice joining two fiber cores together, e.g. a feeder core to a distribution core';
comment on column public.splices.splice_loss_db is 'Measured splice loss in dB, from an OTDR/splicer reading';

-- 3. Enable RLS
alter table public.splice_points enable row level security;
alter table public.splices enable row level security;

-- 4. Policies: splice_points
create policy "splice_points_select_authenticated"
  on public.splice_points for select
  to authenticated
  using (true);

create policy "splice_points_insert_staff"
  on public.splice_points for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splice_points_update_staff"
  on public.splice_points for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splice_points_delete_admin_manager"
  on public.splice_points for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 5. Policies: splices
create policy "splices_select_authenticated"
  on public.splices for select
  to authenticated
  using (true);

create policy "splices_insert_staff"
  on public.splices for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splices_update_staff"
  on public.splices for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "splices_delete_admin_manager"
  on public.splices for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 6. updated_at triggers
create trigger set_splice_points_updated_at
  before update on public.splice_points
  for each row execute function public.set_updated_at();

create trigger set_splices_updated_at
  before update on public.splices
  for each row execute function public.set_updated_at();

-- 7. Indexes
create index splice_points_tg_box_id_idx on public.splice_points (tg_box_id);
create index splices_splice_point_id_idx on public.splices (splice_point_id);
create index splices_core_a_id_idx on public.splices (core_a_id);
create index splices_core_b_id_idx on public.splices (core_b_id);
