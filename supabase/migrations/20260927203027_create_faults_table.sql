-- ============================================================
-- Migration: create_faults_table
-- Purpose: Fault/incident tracking against any network entity
--          (OLT, fiber_cable, tg_box, splitter, customer_connection)
-- ============================================================

-- 1. Entity type enum: which kind of network object this fault is against
create type public.network_entity_type as enum (
  'olt', 'fiber_cable', 'tg_box', 'splitter', 'customer_connection', 'customer'
);

-- 2. Fault severity and status enums
create type public.fault_severity as enum ('low', 'medium', 'high', 'critical');
create type public.fault_status as enum ('open', 'in_progress', 'resolved', 'closed');

-- 3. Faults table
create table public.faults (
  id uuid primary key default gen_random_uuid(),
  entity_type public.network_entity_type not null,
  entity_id uuid not null,
  title text not null,
  description text,
  severity public.fault_severity not null default 'medium',
  status public.fault_status not null default 'open',
  reported_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.faults is 'Fault/incident reports against any network entity, identified polymorphically via entity_type + entity_id';
comment on column public.faults.entity_id is 'Primary key of the row in the table named by entity_type; not a foreign key since it can point to several tables';

-- 4. Enable RLS
alter table public.faults enable row level security;

-- 5. Policies
create policy "faults_select_authenticated"
  on public.faults for select
  to authenticated
  using (true);

-- Any staff (including technician in the field) can report a fault
create policy "faults_insert_staff"
  on public.faults for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "faults_update_staff"
  on public.faults for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "faults_delete_admin_manager"
  on public.faults for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 6. updated_at trigger
create trigger set_faults_updated_at
  before update on public.faults
  for each row execute function public.set_updated_at();

-- 7. Auto-stamp resolved_at when status changes to resolved/closed
create function public.set_fault_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at = now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at = null;
  end if;
  return new;
end;
$$;

create trigger set_faults_resolved_at
  before update on public.faults
  for each row execute function public.set_fault_resolved_at();

-- 8. Indexes
create index faults_entity_idx on public.faults (entity_type, entity_id);
create index faults_status_idx on public.faults (status);
create index faults_assigned_to_idx on public.faults (assigned_to);
