-- ============================================================
-- Migration: fiber_trace
-- Purpose: Everything needed to draw the full path of one fiber:
--          the cores that are joined to it, the splices (and the TG box of
--          each), and the devices attached to those cores.
-- ============================================================

create or replace function public.fiber_trace(p_core uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with comp as (
    select fiber_core as id from public.fiber_component(p_core)
  ),
  core_rows as (
    select c.id, c.core_number, c.color, c.cable_id,
           k.name as cable_name, k.cable_type, k.length_meters
    from public.fiber_cores c
    join public.fiber_cables k on k.id = c.cable_id
    where c.id in (select id from comp)
  ),
  splice_rows as (
    select s.id, b.id as box_id, b.name as box,
           s.core_a_id as a, s.side_a as a_side,
           s.core_b_id as b, s.side_b as b_side,
           s.description as note, s.splice_loss_db as loss
    from public.splices s
    join public.splice_points sp on sp.id = s.splice_point_id
    join public.tg_boxes b on b.id = sp.tg_box_id
    where s.core_a_id in (select id from comp)
       or s.core_b_id in (select id from comp)
  ),
  terminal_rows as (
    select 'olt_port'::text as kind, p.id as ref_id, p.core_id as core,
           p.olt_id as parent_id, o.name as label, p.label::text as detail
      from public.olt_ports p
      join public.olts o on o.id = p.olt_id
      where p.core_id in (select id from comp)
    union all
    select 'olt_uplink', u.id, u.core_id, u.olt_id, o.name, coalesce(u.label, 'Uplink')
      from public.olt_uplinks u
      join public.olts o on o.id = u.olt_id
      where u.core_id in (select id from comp)
    union all
    select 'switch_port', sp.id, sp.core_id, sp.switch_id, s.name,
           coalesce(sp.label, 'Port ' || sp.port_number)
      from public.switch_ports sp
      join public.network_switches s on s.id = sp.switch_id
      where sp.core_id in (select id from comp)
    union all
    select 'splitter', sx.id, sx.input_core_id, sx.id, sx.name, sx.ratio::text
      from public.splitters sx
      where sx.input_core_id in (select id from comp)
    union all
    select 'customer', bc.id, bc.core_id, bc.customer_id, c.name, b.name
      from public.tg_box_customers bc
      join public.customers c on c.id = bc.customer_id
      join public.tg_boxes b on b.id = bc.tg_box_id
      where bc.core_id in (select id from comp)
  )
  select jsonb_build_object(
    'cores',     coalesce((select jsonb_agg(to_jsonb(core_rows)) from core_rows), '[]'::jsonb),
    'splices',   coalesce((select jsonb_agg(to_jsonb(splice_rows)) from splice_rows), '[]'::jsonb),
    'terminals', coalesce((select jsonb_agg(to_jsonb(terminal_rows)) from terminal_rows), '[]'::jsonb)
  );
$$;
