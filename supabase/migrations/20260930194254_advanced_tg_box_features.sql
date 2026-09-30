-- ============================================================
-- Migration: advanced_tg_box_features
-- Purpose: 1) Add a role-based box_category to tg_boxes, separate
--             from the existing mounting-based box_type.
--          2) Add a tg_box_cables junction table so a box can have
--             multiple input/output cables, each labeled by role.
-- ============================================================

-- 1. Box category enum (role inside the network, not mounting style)
create type public.tg_box_category as enum (
  'joint_2port',
  'joint_4port',
  'joint_8port',
  'joint_16port',
  'splitter_primary_main',
  'splitter_primary_2nd',
  'splitter_customer'
);

alter table public.tg_boxes
  add column box_category public.tg_box_category;

comment on column public.tg_boxes.box_category is 'Role of this box in the network: joint box (by port count) or splitter box (primary main / primary 2nd / customer)';
comment on column public.tg_boxes.box_type is 'Physical mounting style: aerial, underground, wall_mounted, pole_mounted';

-- 2. tg_box_cables: multiple input/output cables per box, each a
--    labeled link so the UI can show "Cable X (input)" / "Cable Y (output)"
create type public.cable_link_direction as enum ('input', 'output');

create table public.tg_box_cables (
  id uuid primary key default gen_random_uuid(),
  tg_box_id uuid not null references public.tg_boxes(id) on delete cascade,
  cable_id uuid not null references public.fiber_cables(id) on delete cascade,
  direction public.cable_link_direction not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tg_box_id, cable_id, direction)
);

comment on table public.tg_box_cables is 'Links a TG/joint box to any number of input and output fiber cables';

alter table public.tg_box_cables enable row level security;

create policy "tg_box_cables_select_authenticated"
  on public.tg_box_cables for select
  to authenticated
  using (true);

create policy "tg_box_cables_insert_staff"
  on public.tg_box_cables for insert
  to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "tg_box_cables_delete_staff"
  on public.tg_box_cables for delete
  to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

create index tg_box_cables_tg_box_id_idx on public.tg_box_cables (tg_box_id);
create index tg_box_cables_cable_id_idx on public.tg_box_cables (cable_id);
