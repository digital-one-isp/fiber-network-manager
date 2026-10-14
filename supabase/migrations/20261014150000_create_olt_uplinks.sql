-- ============================================================
-- Migration: create_olt_uplinks
-- Purpose: Record which switch port each OLT uplink is plugged into.
-- ============================================================

create table public.olt_uplinks (
  id uuid primary key default gen_random_uuid(),
  olt_id uuid not null references public.olts(id) on delete cascade,
  label text,
  speed public.port_speed not null default '10G',
  sfp_module text,
  switch_port_id uuid references public.switch_ports(id) on delete set null,
  description text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (switch_port_id)
);

comment on table public.olt_uplinks is 'Uplink ports of an OLT and the switch port each one is connected to';

create index olt_uplinks_olt_id_idx on public.olt_uplinks (olt_id);

alter table public.olt_uplinks enable row level security;

create policy "olt_uplinks_select_authenticated" on public.olt_uplinks
  for select to authenticated using (true);
create policy "olt_uplinks_insert_staff" on public.olt_uplinks
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "olt_uplinks_update_staff" on public.olt_uplinks
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "olt_uplinks_delete_admin_manager" on public.olt_uplinks
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

create trigger set_olt_uplinks_updated_at
  before update on public.olt_uplinks
  for each row execute function public.set_updated_at();

-- A port that serves a reseller or an upstream cannot also be an OLT uplink
create or replace function public.validate_olt_uplink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.switch_port_id is not null and exists (
    select 1 from public.switch_ports p
    where p.id = new.switch_port_id
      and (p.reseller_id is not null or p.upstream_id is not null)
  ) then
    raise exception 'That switch port already serves a reseller or an upstream link';
  end if;
  return new;
end;
$$;

create trigger olt_uplinks_validate
  before insert or update of switch_port_id on public.olt_uplinks
  for each row execute function public.validate_olt_uplink();

-- Keep the switch port status in step with the uplink
create or replace function public.sync_olt_uplink_port()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_port uuid;
  new_port uuid;
begin
  if tg_op <> 'INSERT' then
    old_port := old.switch_port_id;
  end if;
  if tg_op <> 'DELETE' then
    new_port := new.switch_port_id;
  end if;

  if old_port is not null and old_port is distinct from new_port then
    update public.switch_ports set status = 'free'
      where id = old_port and status = 'active'
        and cable_id is null and reseller_id is null and upstream_id is null;
  end if;

  if new_port is not null then
    update public.switch_ports set status = 'active'
      where id = new_port and status = 'free';
  end if;

  return null;
end;
$$;

create trigger olt_uplinks_sync_port
  after insert or update of switch_port_id or delete on public.olt_uplinks
  for each row execute function public.sync_olt_uplink_port();

create trigger audit_olt_uplinks
  after insert or update or delete on public.olt_uplinks
  for each row execute function public.log_audit_event();

-- And the other way round: a port that is an OLT uplink cannot be given
-- to a reseller or an upstream
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

  if (new.reseller_id is not null or new.upstream_id is not null)
     and exists (select 1 from public.olt_uplinks u where u.switch_port_id = new.id) then
    raise exception 'This port already carries an OLT uplink';
  end if;

  if (new.cable_id is not null or new.reseller_id is not null or new.upstream_id is not null)
     and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;
