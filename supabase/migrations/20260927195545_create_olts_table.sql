-- ============================================================
-- Migration: create_olts_table
-- Purpose: OLT (Optical Line Terminal) inventory - top of network hierarchy
-- ============================================================

-- 1. Status enum for network equipment (reused by later tables too)
create type public.equipment_status as enum ('active', 'inactive', 'maintenance', 'faulty');

-- 2. OLTs table
create table public.olts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  model text,
  management_ip inet,
  total_pon_ports integer not null default 0,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.olts is 'Optical Line Terminals - top-level network nodes, each located at Office/NOC or a remote site';

-- 3. Enable RLS
alter table public.olts enable row level security;

-- 4. Policies
-- Any authenticated user can view OLTs (needed for map/dashboard)
create policy "olts_select_authenticated"
  on public.olts for select
  to authenticated
  using (true);

-- Only admin/manager/technician can create OLTs
create policy "olts_insert_staff"
  on public.olts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

-- Only admin/manager/technician can update OLTs
create policy "olts_update_staff"
  on public.olts for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician')
    )
  );

-- Only admin/manager can delete OLTs
create policy "olts_delete_admin_manager"
  on public.olts for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'manager')
    )
  );

-- 5. Keep updated_at fresh (reuses the function created in the profiles migration)
create trigger set_olts_updated_at
  before update on public.olts
  for each row execute function public.set_updated_at();

-- 6. Helpful index for map queries
create index olts_lat_lng_idx on public.olts (latitude, longitude);
