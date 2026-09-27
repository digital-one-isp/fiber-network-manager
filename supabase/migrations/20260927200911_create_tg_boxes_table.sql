-- ============================================================
-- Migration: create_tg_boxes_table
-- Purpose: TG/Joint Boxes - physical enclosures where feeder cables
--          are spliced onward toward splitters/distribution
-- ============================================================

-- 1. TG box type
create type public.tg_box_type as enum ('aerial', 'underground', 'wall_mounted', 'pole_mounted');

-- 2. TG boxes table
create table public.tg_boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  box_type public.tg_box_type not null default 'pole_mounted',
  capacity integer not null default 24 check (capacity > 0),
  latitude double precision not null,
  longitude double precision not null,
  address text,
  parent_cable_id uuid references public.fiber_cables(id) on delete set null,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tg_boxes is 'TG/Joint boxes - splice enclosures between feeder cable and distribution/splitters';
comment on column public.tg_boxes.parent_cable_id is 'The feeder cable that enters this box';
comment on column public.tg_boxes.capacity is 'Maximum number of splice/core slots this box supports';

-- 3. Enable RLS
alter table public.tg_boxes enable row level security;

-- 4. Policies (same staff-based pattern)
create policy "tg_boxes_select_authenticated"
  on public.tg_boxes for select
  to authenticated
  using (true);

create policy "tg_boxes_insert_staff"
  on public.tg_boxes for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "tg_boxes_update_staff"
  on public.tg_boxes for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "tg_boxes_delete_admin_manager"
  on public.tg_boxes for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- 5. updated_at trigger
create trigger set_tg_boxes_updated_at
  before update on public.tg_boxes
  for each row execute function public.set_updated_at();

-- 6. Indexes
create index tg_boxes_lat_lng_idx on public.tg_boxes (latitude, longitude);
create index tg_boxes_parent_cable_id_idx on public.tg_boxes (parent_cable_id);
