-- ============================================================
-- Migration: create_fiber_cables_table
-- Purpose: Multi-core fiber cables (feeder + distribution) running
--          between network points (OLT, TG/joint box, splitter, customer)
-- ============================================================

-- 1. Cable type: where in the hierarchy this cable sits
create type public.cable_type as enum ('feeder', 'distribution', 'drop');

-- 2. Generic "network node" reference approach:
--    A cable connects a from_node to a to_node. Since nodes can be
--    OLTs, TG/joint boxes, splitters, or customers, we use a
--    polymorphic reference: a type + uuid pair, validated at the
--    application layer (Postgres has no native polymorphic FK).
--    We revisit this with real FKs once tg_boxes/splitters exist.

create table public.fiber_cables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cable_type public.cable_type not null default 'feeder',
  core_count integer not null check (core_count > 0),
  olt_id uuid references public.olts(id) on delete set null,
  length_meters numeric(10, 2),
  route_geojson jsonb,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fiber_cables is 'Multi-core fiber cable runs; route_geojson stores the drawn path for map display';
comment on column public.fiber_cables.olt_id is 'The OLT this cable originates from, when it is a feeder cable';
comment on column public.fiber_cables.route_geojson is 'GeoJSON LineString of the physical route, drawn on the map';

-- 3. Enable RLS
alter table public.fiber_cables enable row level security;

-- 4. Policies (same staff-based pattern as olts)
create policy "fiber_cables_select_authenticated"
  on public.fiber_cables for select
  to authenticated
  using (true);

create policy "fiber_cables_insert_staff"
  on public.fiber_cables for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "fiber_cables_update_staff"
  on public.fiber_cables for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

create policy "fiber_cables_delete_admin_manager"
  on public.fiber_cables for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- 5. updated_at trigger
create trigger set_fiber_cables_updated_at
  before update on public.fiber_cables
  for each row execute function public.set_updated_at();

-- 6. Index for looking up cables by OLT
create index fiber_cables_olt_id_idx on public.fiber_cables (olt_id);
