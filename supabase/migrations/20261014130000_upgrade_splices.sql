-- ============================================================
-- Migration: upgrade_splices
-- Purpose: Let one cable pass through a box (in and out) and splice its
--          cores to each other, same color to same color or any to any.
--          A fiber end is identified by core + side (input/output) and may
--          be spliced once per box. Adds an optional description.
-- ============================================================

alter table public.splices
  add column side_a public.cable_link_direction,
  add column side_b public.cable_link_direction,
  add column description text;

comment on column public.splices.side_a is 'Which side of the box fiber end A is on: the cable linked as input or as output';
comment on column public.splices.description is 'Optional note about this splice';

-- Work out the side for splices that already exist
update public.splices s
set side_a = coalesce((
      select l.direction
      from public.splice_points sp
      join public.tg_box_cables l on l.tg_box_id = sp.tg_box_id
      join public.fiber_cores c on c.cable_id = l.cable_id
      where sp.id = s.splice_point_id and c.id = s.core_a_id
      order by (l.direction = 'input') desc
      limit 1
    ), 'input'::public.cable_link_direction),
    side_b = coalesce((
      select l.direction
      from public.splice_points sp
      join public.tg_box_cables l on l.tg_box_id = sp.tg_box_id
      join public.fiber_cores c on c.cable_id = l.cable_id
      where sp.id = s.splice_point_id and c.id = s.core_b_id
      order by (l.direction = 'input') desc
      limit 1
    ), 'input'::public.cable_link_direction);

alter table public.splices
  alter column side_a set not null,
  alter column side_b set not null;

-- Drop the old rules (a core could only be spliced once in the whole
-- network, and a core could never meet itself)
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.splices'::regclass and contype in ('u', 'c')
  loop
    execute format('alter table public.splices drop constraint %I', r.conname);
  end loop;
end;
$$;

-- The same core may be on both ends only when the ends are on different sides
-- (a core passing straight through the box)
alter table public.splices
  add constraint splices_endpoints_differ
  check (core_a_id <> core_b_id or side_a <> side_b);

-- Both cables must be linked to this box on the chosen side, and a fiber end
-- can be spliced only once in a box
create or replace function public.validate_splice()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_box uuid;
  cable_a uuid;
  cable_b uuid;
begin
  select tg_box_id into v_box from public.splice_points where id = new.splice_point_id;
  if v_box is null then
    raise exception 'The splice tray does not exist';
  end if;

  select cable_id into cable_a from public.fiber_cores where id = new.core_a_id;
  select cable_id into cable_b from public.fiber_cores where id = new.core_b_id;

  if not exists (
    select 1 from public.tg_box_cables l
    where l.tg_box_id = v_box and l.cable_id = cable_a and l.direction = new.side_a
  ) then
    raise exception 'Link the cable of the first fiber end to this box as % before splicing it', new.side_a;
  end if;

  if not exists (
    select 1 from public.tg_box_cables l
    where l.tg_box_id = v_box and l.cable_id = cable_b and l.direction = new.side_b
  ) then
    raise exception 'Link the cable of the second fiber end to this box as % before splicing it', new.side_b;
  end if;

  if exists (
    select 1
    from public.splices s
    join public.splice_points sp on sp.id = s.splice_point_id
    where sp.tg_box_id = v_box and s.id <> new.id
      and ((s.core_a_id = new.core_a_id and s.side_a = new.side_a)
        or (s.core_b_id = new.core_a_id and s.side_b = new.side_a))
  ) then
    raise exception 'The first fiber end is already spliced in this box';
  end if;

  if exists (
    select 1
    from public.splices s
    join public.splice_points sp on sp.id = s.splice_point_id
    where sp.tg_box_id = v_box and s.id <> new.id
      and ((s.core_a_id = new.core_b_id and s.side_a = new.side_b)
        or (s.core_b_id = new.core_b_id and s.side_b = new.side_b))
  ) then
    raise exception 'The second fiber end is already spliced in this box';
  end if;

  return new;
end;
$$;

create trigger splices_validate
  before insert or update of splice_point_id, core_a_id, side_a, core_b_id, side_b
  on public.splices
  for each row execute function public.validate_splice();
