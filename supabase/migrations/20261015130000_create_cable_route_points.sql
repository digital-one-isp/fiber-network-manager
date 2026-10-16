-- ============================================================
-- Migration: create_cable_route_points
-- Purpose: Record the route of a fiber cable as an ordered list of
--          points (start, middle, end). Each point carries the length
--          mark printed on the cable at that spot, so the distance
--          between points and the total length come from the marks.
-- ============================================================

create type public.route_point_kind as enum
  ('pole', 'handhole', 'manhole', 'building', 'junction', 'tg_box', 'olt', 'customer', 'other');

create table public.cable_route_points (
  id uuid primary key default gen_random_uuid(),
  cable_id uuid not null references public.fiber_cables(id) on delete cascade,
  sort_order double precision not null,
  length_mark_m numeric(10, 2) check (length_mark_m >= 0),
  place text,
  kind public.route_point_kind not null default 'pole',
  tg_box_id uuid references public.tg_boxes(id) on delete set null,
  olt_id uuid references public.olts(id) on delete set null,
  route_note text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cable_route_points is 'Ordered points along a cable route; the first is the start and the last is the end';
comment on column public.cable_route_points.length_mark_m is 'The meter mark printed on the cable at this point';
comment on column public.cable_route_points.route_note is 'How the cable goes from the previous point to this one';
comment on column public.cable_route_points.sort_order is 'Position in the route; only the order matters, so new points can slot in between';

create index cable_route_points_cable_idx on public.cable_route_points (cable_id, sort_order);

alter table public.cable_route_points enable row level security;

create policy "cable_route_points_select_authenticated" on public.cable_route_points
  for select to authenticated using (true);
create policy "cable_route_points_insert_staff" on public.cable_route_points
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "cable_route_points_update_staff" on public.cable_route_points
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "cable_route_points_delete_staff" on public.cable_route_points
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

create trigger set_cable_route_points_updated_at
  before update on public.cable_route_points
  for each row execute function public.set_updated_at();

create trigger audit_cable_route_points
  after insert or update or delete on public.cable_route_points
  for each row execute function public.log_audit_event();

-- Keep the cable's route line (for the map) in step with the points that
-- have GPS coordinates.
create or replace function public.rebuild_cable_route()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cable uuid;
  geo jsonb;
begin
  if tg_op = 'DELETE' then
    v_cable := old.cable_id;
  else
    v_cable := new.cable_id;
  end if;

  select jsonb_build_object(
           'type', 'LineString',
           'coordinates', jsonb_agg(jsonb_build_array(p.longitude, p.latitude) order by p.sort_order))
    into geo
  from public.cable_route_points p
  where p.cable_id = v_cable
    and p.latitude is not null
    and p.longitude is not null
  having count(*) >= 2;

  update public.fiber_cables
    set route_geojson = geo
    where id = v_cable and route_geojson is distinct from geo;

  return null;
end;
$$;

create trigger cable_route_points_rebuild
  after insert or update of latitude, longitude, sort_order or delete
  on public.cable_route_points
  for each row execute function public.rebuild_cable_route();
