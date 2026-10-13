-- ============================================================
-- Migration: create_switches_and_resellers
-- Purpose: Network switches (BDCOM, Cisco, ...) with 1G/10G+ ports,
--          and resellers who are handed a fiber/SFP from a switch port.
-- ============================================================

create type public.switch_role as enum ('core', 'aggregation', 'access', 'other');
create type public.port_speed as enum ('100M', '1G', '2.5G', '10G', '25G', '40G', '100G');
create type public.port_media as enum ('sfp', 'sfp_plus', 'sfp28', 'qsfp', 'rj45');
create type public.switch_port_status as enum
  ('free', 'active', 'reserved', 'faulty', 'disabled');

-- Resellers
create table public.resellers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  latitude double precision,
  longitude double precision,
  bandwidth_mbps integer check (bandwidth_mbps > 0),
  status public.customer_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.resellers is 'Reseller businesses that receive a fiber/SFP handoff from one of our switch ports';

-- Switches
create table public.network_switches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  model text,
  management_ip inet,
  role public.switch_role not null default 'aggregation',
  latitude double precision,
  longitude double precision,
  address text,
  status public.equipment_status not null default 'active',
  ports_1g smallint not null default 0 check (ports_1g between 0 and 96),
  ports_10g smallint not null default 0 check (ports_10g between 0 and 96),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.network_switches is 'Network switches; ports_1g and ports_10g are the SFP ports auto-created when the switch is added';

-- Switch ports
create table public.switch_ports (
  id uuid primary key default gen_random_uuid(),
  switch_id uuid not null references public.network_switches(id) on delete cascade,
  port_number integer not null check (port_number > 0),
  label text,
  speed public.port_speed not null default '1G',
  media public.port_media not null default 'sfp',
  status public.switch_port_status not null default 'free',
  sfp_module text,
  description text,
  cable_id uuid references public.fiber_cables(id) on delete set null,
  core_id uuid references public.fiber_cores(id) on delete set null,
  reseller_id uuid references public.resellers(id) on delete set null,
  vlan integer check (vlan between 1 and 4094),
  bandwidth_mbps integer check (bandwidth_mbps > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (switch_id, port_number),
  unique (core_id)
);

create index switch_ports_switch_id_idx on public.switch_ports (switch_id);
create index switch_ports_reseller_id_idx on public.switch_ports (reseller_id);
create index switch_ports_cable_id_idx on public.switch_ports (cable_id);

-- Row level security
alter table public.resellers enable row level security;
alter table public.network_switches enable row level security;
alter table public.switch_ports enable row level security;

create policy "resellers_select_authenticated" on public.resellers
  for select to authenticated using (true);
create policy "resellers_insert_staff" on public.resellers
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "resellers_update_staff" on public.resellers
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "resellers_delete_admin_manager" on public.resellers
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

create policy "network_switches_select_authenticated" on public.network_switches
  for select to authenticated using (true);
create policy "network_switches_insert_staff" on public.network_switches
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "network_switches_update_staff" on public.network_switches
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "network_switches_delete_admin_manager" on public.network_switches
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

create policy "switch_ports_select_authenticated" on public.switch_ports
  for select to authenticated using (true);
create policy "switch_ports_insert_staff" on public.switch_ports
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "switch_ports_update_staff" on public.switch_ports
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "switch_ports_delete_admin_manager" on public.switch_ports
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- updated_at
create trigger set_resellers_updated_at
  before update on public.resellers
  for each row execute function public.set_updated_at();
create trigger set_network_switches_updated_at
  before update on public.network_switches
  for each row execute function public.set_updated_at();
create trigger set_switch_ports_updated_at
  before update on public.switch_ports
  for each row execute function public.set_updated_at();

-- Create the 1G and 10G SFP ports when a switch is added
create or replace function public.generate_switch_ports()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.switch_ports (switch_id, port_number, label, speed, media)
  select new.id, g, 'GE-' || lpad(g::text, 2, '0'),
         '1G'::public.port_speed, 'sfp'::public.port_media
  from generate_series(1, new.ports_1g) as g;

  insert into public.switch_ports (switch_id, port_number, label, speed, media)
  select new.id, new.ports_1g + g, 'XGE-' || lpad(g::text, 2, '0'),
         '10G'::public.port_speed, 'sfp_plus'::public.port_media
  from generate_series(1, new.ports_10g) as g;

  return null;
end;
$$;

create trigger network_switches_generate_ports
  after insert on public.network_switches
  for each row execute function public.generate_switch_ports();

-- Before save: the core must belong to the cable; picking a core fills in
-- its cable; a connected port is no longer "free".
create or replace function public.prepare_switch_port()
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

  if (new.cable_id is not null or new.reseller_id is not null)
     and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

create trigger switch_ports_prepare
  before insert or update on public.switch_ports
  for each row execute function public.prepare_switch_port();

-- After save: keep the core's status in step. A core is only freed when
-- no OLT port or switch port still uses it.
create or replace function public.sync_switch_port_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_core uuid;
  new_core uuid;
begin
  if tg_op <> 'INSERT' then
    old_core := old.core_id;
  end if;
  if tg_op <> 'DELETE' then
    new_core := new.core_id;
  end if;

  if old_core is not null and old_core is distinct from new_core then
    if not exists (select 1 from public.olt_ports where core_id = old_core)
       and not exists (
         select 1 from public.switch_ports p
         where p.core_id = old_core and p.id <> old.id
       ) then
      update public.fiber_cores set status = 'free'
        where id = old_core and status = 'used';
    end if;
  end if;

  if new_core is not null then
    update public.fiber_cores set status = 'used'
      where id = new_core and status = 'free';
  end if;

  return null;
end;
$$;

create trigger switch_ports_sync_links
  after insert or update of core_id or delete on public.switch_ports
  for each row execute function public.sync_switch_port_links();

-- OLT ports must not free a core that a switch port still uses
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
    if not exists (select 1 from public.switch_ports where core_id = old_core) then
      update public.fiber_cores set status = 'free'
        where id = old_core and status = 'used';
    end if;
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

-- Audit history
create trigger audit_resellers
  after insert or update or delete on public.resellers
  for each row execute function public.log_audit_event();
create trigger audit_network_switches
  after insert or update or delete on public.network_switches
  for each row execute function public.log_audit_event();
create trigger audit_switch_ports
  after insert or update or delete on public.switch_ports
  for each row execute function public.log_audit_event();
