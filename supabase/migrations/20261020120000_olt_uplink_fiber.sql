-- ============================================================
-- Migration: olt_uplink_fiber
-- Purpose: When an OLT uplink runs over fiber, record which fiber cable
--          and which core it uses. Cores stay marked "used" while any
--          OLT port, OLT uplink or switch port holds them.
-- ============================================================

alter table public.olt_uplinks
  add column cable_id uuid references public.fiber_cables(id) on delete set null,
  add column core_id uuid references public.fiber_cores(id) on delete set null,
  add constraint olt_uplinks_core_id_key unique (core_id);

create index olt_uplinks_cable_id_idx on public.olt_uplinks (cable_id);

-- Is this core held by an OLT port, an OLT uplink or a switch port?
create or replace function public.core_in_use(p_core uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.olt_ports where core_id = p_core)
      or exists (select 1 from public.switch_ports where core_id = p_core)
      or exists (select 1 from public.olt_uplinks where core_id = p_core);
$$;

-- Before save: the core must belong to the cable; picking a core fills in
-- its cable; a cable means the link is fiber; a connected uplink is active.
create or replace function public.prepare_olt_uplink()
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

  if new.cable_id is not null then
    if new.link_type is null then
      new.link_type := 'fiber';
    elsif new.link_type <> 'fiber' then
      raise exception 'A fiber cable can only be set when the connection type is fiber';
    end if;
  end if;

  if (new.switch_port_id is not null or new.cable_id is not null)
     and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

-- After save: keep the core status in step
create or replace function public.sync_olt_uplink_links()
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

  if old_core is not null and old_core is distinct from new_core
     and not public.core_in_use(old_core) then
    update public.fiber_cores set status = 'free'
      where id = old_core and status = 'used';
  end if;

  if new_core is not null then
    update public.fiber_cores set status = 'used'
      where id = new_core and status = 'free';
  end if;

  return null;
end;
$$;

create trigger olt_uplinks_sync_links
  after insert or update of core_id or delete on public.olt_uplinks
  for each row execute function public.sync_olt_uplink_links();

-- The two older sync functions must not free a core an uplink still holds
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

  if old_core is not null and old_core is distinct from new_core
     and not public.core_in_use(old_core) then
    update public.fiber_cores set status = 'free'
      where id = old_core and status = 'used';
  end if;

  if new_core is not null then
    update public.fiber_cores set status = 'used'
      where id = new_core and status = 'free';
  end if;

  return null;
end;
$$;

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

  if old_core is not null and old_core is distinct from new_core
     and not public.core_in_use(old_core) then
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
