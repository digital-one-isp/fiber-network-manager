-- ============================================================
-- Migration: fiber_auto_link
-- Purpose: Work out connections from the fiber itself. A core is one
--          continuous fiber along its cable and a splice joins one core
--          to another. Following the splices shows which devices share
--          the same fiber, so an OLT uplink is linked to the switch port
--          on its fiber automatically. A link set by hand always wins.
-- ============================================================

alter table public.olt_uplinks
  add column link_auto boolean not null default false;

comment on column public.olt_uplinks.link_auto is 'True when switch_port_id was found automatically by following the fiber through splices';

-- Every core that is the same fiber as p_core: itself plus all cores
-- joined to it by splices, directly or through other splices
create or replace function public.fiber_component(p_core uuid)
returns table (fiber_core uuid)
language sql
stable
set search_path = public
as $$
  with recursive walk(id) as (
    select p_core
    union
    select case when s.core_a_id = w.id then s.core_b_id else s.core_a_id end
    from walk w
    join public.splices s
      on (s.core_a_id = w.id or s.core_b_id = w.id)
     and s.core_a_id <> s.core_b_id
  )
  select id from walk;
$$;

-- The devices that sit on the same fiber as p_core
create or replace function public.fiber_terminals(p_core uuid)
returns table (kind text, ref_id uuid, label text, detail text)
language sql
stable
set search_path = public
as $$
  with comp as (select fiber_core from public.fiber_component(p_core))
  select 'olt_port'::text, p.id, o.name, p.label::text
    from public.olt_ports p
    join public.olts o on o.id = p.olt_id
    where p.core_id in (select fiber_core from comp)
  union all
  select 'olt_uplink', u.id, o.name, coalesce(u.label, 'Uplink')
    from public.olt_uplinks u
    join public.olts o on o.id = u.olt_id
    where u.core_id in (select fiber_core from comp)
  union all
  select 'switch_port', sp.id, s.name, coalesce(sp.label, 'Port ' || sp.port_number)
    from public.switch_ports sp
    join public.network_switches s on s.id = sp.switch_id
    where sp.core_id in (select fiber_core from comp)
  union all
  select 'splitter', sx.id, sx.name, sx.ratio::text
    from public.splitters sx
    where sx.input_core_id in (select fiber_core from comp)
  union all
  select 'box_customer', bc.id, c.name, b.name
    from public.tg_box_customers bc
    join public.customers c on c.id = bc.customer_id
    join public.tg_boxes b on b.id = bc.tg_box_id
    where bc.core_id in (select fiber_core from comp);
$$;

-- The splices that join the cores of this fiber
create or replace function public.fiber_hops(p_core uuid)
returns table (box_name text, a_cable text, a_core integer, b_cable text, b_core integer)
language sql
stable
set search_path = public
as $$
  with comp as (select fiber_core from public.fiber_component(p_core))
  select b.name, ca.name, fa.core_number, cb.name, fb.core_number
  from public.splices s
  join public.splice_points sp on sp.id = s.splice_point_id
  join public.tg_boxes b on b.id = sp.tg_box_id
  join public.fiber_cores fa on fa.id = s.core_a_id
  join public.fiber_cables ca on ca.id = fa.cable_id
  join public.fiber_cores fb on fb.id = s.core_b_id
  join public.fiber_cables cb on cb.id = fb.cable_id
  where s.core_a_id in (select fiber_core from comp)
    and s.core_a_id <> s.core_b_id
  order by b.name, ca.name, fa.core_number;
$$;

-- Before save: same rules as before, plus: a change of switch port that
-- did not come from the automatic linking is a manual choice.
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

  if tg_op = 'UPDATE'
     and new.switch_port_id is distinct from old.switch_port_id
     and coalesce(current_setting('app.auto_link', true), 'off') <> 'on' then
    new.link_auto := false;
  end if;

  if (new.switch_port_id is not null or new.cable_id is not null)
     and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

-- Link OLT uplinks to the switch port on the same fiber.
-- Only an unambiguous match is linked. Manual links are never touched.
-- An automatic link is removed again when the fiber no longer reaches it.
create or replace function public.auto_link_fiber(p_core uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  comp uuid[];
  u record;
  cand uuid[];
begin
  if p_core is null then
    return;
  end if;

  select array_agg(fiber_core) into comp from public.fiber_component(p_core);

  perform set_config('app.auto_link', 'on', true);

  for u in
    select id, switch_port_id, link_auto
    from public.olt_uplinks
    where core_id = any(comp)
  loop
    if u.switch_port_id is not null and not u.link_auto then
      continue;
    end if;

    select array_agg(sp.id) into cand
    from public.switch_ports sp
    where sp.core_id = any(comp)
      and sp.reseller_id is null
      and sp.upstream_id is null
      and not exists (
        select 1 from public.olt_uplinks o2
        where o2.switch_port_id = sp.id and o2.id <> u.id
      );

    if cand is not null and array_length(cand, 1) = 1 then
      if u.switch_port_id is distinct from cand[1] then
        update public.olt_uplinks
          set switch_port_id = cand[1], link_auto = true
          where id = u.id;
      end if;
    elsif cand is null and u.link_auto then
      update public.olt_uplinks
        set switch_port_id = null, link_auto = false
        where id = u.id;
    end if;
  end loop;

  perform set_config('app.auto_link', 'off', true);
end;
$$;

revoke execute on function public.auto_link_fiber(uuid) from public, anon;
grant execute on function public.auto_link_fiber(uuid) to authenticated;

-- Run the linking whenever a splice, an uplink fiber or a switch port fiber changes
create or replace function public.splices_auto_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.auto_link_fiber(old.core_a_id);
    perform public.auto_link_fiber(old.core_b_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.auto_link_fiber(new.core_a_id);
    perform public.auto_link_fiber(new.core_b_id);
  end if;
  return null;
end;
$$;

create trigger splices_auto_link
  after insert or update or delete on public.splices
  for each row execute function public.splices_auto_link();

create or replace function public.olt_uplinks_auto_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.auto_link_fiber(old.core_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.auto_link_fiber(new.core_id);
  end if;
  return null;
end;
$$;

create trigger olt_uplinks_auto_link
  after insert or update of core_id or delete on public.olt_uplinks
  for each row execute function public.olt_uplinks_auto_link();

create or replace function public.switch_ports_auto_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.auto_link_fiber(old.core_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.auto_link_fiber(new.core_id);
  end if;
  return null;
end;
$$;

create trigger switch_ports_auto_link
  after insert or update of core_id or delete on public.switch_ports
  for each row execute function public.switch_ports_auto_link();

-- Link what already exists
do $$
declare
  r record;
begin
  for r in select core_id from public.olt_uplinks where core_id is not null loop
    perform public.auto_link_fiber(r.core_id);
  end loop;
  for r in select core_id from public.switch_ports where core_id is not null loop
    perform public.auto_link_fiber(r.core_id);
  end loop;
end;
$$;
