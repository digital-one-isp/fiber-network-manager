-- ============================================================
-- Migration: create_olt_ports
-- Purpose: Document every PON port on an OLT (label, description,
--          optics) and record which fiber cable / core is plugged
--          into it.
-- ============================================================

create type public.pon_port_status as enum
  ('free', 'active', 'reserved', 'faulty', 'disabled');

create table public.olt_ports (
  id uuid primary key default gen_random_uuid(),
  olt_id uuid not null references public.olts(id) on delete cascade,
  port_number integer not null check (port_number > 0),
  label text,
  description text,
  status public.pon_port_status not null default 'free',
  sfp_module text,
  tx_power_dbm numeric(5, 2),
  cable_id uuid references public.fiber_cables(id) on delete set null,
  core_id uuid references public.fiber_cores(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (olt_id, port_number),
  unique (core_id)
);

comment on table public.olt_ports is 'PON ports of an OLT, with a description and the fiber cable/core connected to each';
comment on column public.olt_ports.core_id is 'The single fiber core plugged into this PON port (a core can only be on one port)';

create index olt_ports_olt_id_idx on public.olt_ports (olt_id);
create index olt_ports_cable_id_idx on public.olt_ports (cable_id);

-- Row level security
alter table public.olt_ports enable row level security;

create policy "olt_ports_select_authenticated"
  on public.olt_ports for select
  to authenticated
  using (true);

create policy "olt_ports_insert_staff"
  on public.olt_ports for insert
  to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "olt_ports_update_staff"
  on public.olt_ports for update
  to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "olt_ports_delete_admin_manager"
  on public.olt_ports for delete
  to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- Before save: the core must belong to the cable; picking a core
-- fills in its cable; a connected port is no longer "free".
create or replace function public.prepare_olt_port()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  core_cable uuid;
begin
  if new.core_id is not null then
    select cable_id into core_cable from public.fiber_cores where id = new.core_id;
    if core_cable is null then
      raise exception 'The selected core does not exist';
    end if;
    if new.cable_id is null then
      new.cable_id := core_cable;
    elsif new.cable_id <> core_cable then
      raise exception 'The selected core does not belong to the selected cable';
    end if;
  end if;

  if new.cable_id is not null and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

create trigger olt_ports_prepare
  before insert or update on public.olt_ports
  for each row execute function public.prepare_olt_port();

-- After save: keep the cable's OLT and the core's status in step.
create or replace function public.sync_olt_port_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_core uuid;
  old_cable uuid;
  new_core uuid;
  new_cable uuid;
begin
  if tg_op <> 'INSERT' then
    old_core := old.core_id;
    old_cable := old.cable_id;
  end if;
  if tg_op <> 'DELETE' then
    new_core := new.core_id;
    new_cable := new.cable_id;
  end if;

  if old_core is not null and old_core is distinct from new_core then
    update public.fiber_cores set status = 'free'
      where id = old_core and status = 'used';
  end if;

  if old_cable is not null and old_cable is distinct from new_cable then
    if not exists (
      select 1 from public.olt_ports p
      where p.cable_id = old_cable and p.id <> old.id
    ) then
      update public.fiber_cables set olt_id = null
        where id = old_cable and olt_id = old.olt_id;
    end if;
  end if;

  if new_cable is not null then
    update public.fiber_cables set olt_id = new.olt_id
      where id = new_cable and olt_id is distinct from new.olt_id;
  end if;

  if new_core is not null then
    update public.fiber_cores set status = 'used'
      where id = new_core and status = 'free';
  end if;

  return null;
end;
$$;

create trigger olt_ports_sync_links
  after insert or update of cable_id, core_id or delete on public.olt_ports
  for each row execute function public.sync_olt_port_links();

create trigger set_olt_ports_updated_at
  before update on public.olt_ports
  for each row execute function public.set_updated_at();

-- Create the ports automatically from olts.total_pon_ports.
-- Raising the number adds ports. Lowering it only removes trailing
-- ports that are unused and undocumented.
create or replace function public.sync_olt_ports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.olt_ports (olt_id, port_number, label)
  select new.id, g, 'PON-' || lpad(g::text, 2, '0')
  from generate_series(1, greatest(coalesce(new.total_pon_ports, 0), 0)) as g
  on conflict (olt_id, port_number) do nothing;

  if tg_op = 'UPDATE' then
    delete from public.olt_ports
    where olt_id = new.id
      and port_number > coalesce(new.total_pon_ports, 0)
      and cable_id is null
      and core_id is null
      and status = 'free'
      and description is null
      and notes is null;
  end if;

  return null;
end;
$$;

create trigger olts_sync_ports
  after insert or update of total_pon_ports on public.olts
  for each row execute function public.sync_olt_ports();

-- Create ports for the OLTs that already exist
insert into public.olt_ports (olt_id, port_number, label)
select o.id, g, 'PON-' || lpad(g::text, 2, '0')
from public.olts o, generate_series(1, greatest(o.total_pon_ports, 0)) as g
on conflict (olt_id, port_number) do nothing;

-- Audit history
create trigger audit_olt_ports
  after insert or update or delete on public.olt_ports
  for each row execute function public.log_audit_event();
