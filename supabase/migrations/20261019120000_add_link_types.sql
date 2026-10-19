-- ============================================================
-- Migration: add_link_types
-- Purpose: Record what a port is connected with: fiber, DAC cable,
--          RJ45 Cat5e/Cat6/Cat6a or something else, plus its length.
-- ============================================================

create type public.link_medium as enum ('fiber', 'dac', 'cat5e', 'cat6', 'cat6a', 'other');

alter table public.olt_uplinks
  add column link_type public.link_medium,
  add column link_length_m numeric(8, 2) check (link_length_m >= 0),
  add column link_note text;

alter table public.switch_ports
  add column link_type public.link_medium,
  add column link_length_m numeric(8, 2) check (link_length_m >= 0),
  add column link_note text;

-- A DAC or Cat6 link has no fiber cable or core
alter table public.switch_ports
  add constraint switch_ports_link_cable_rule
  check (link_type is null or link_type = 'fiber' or (cable_id is null and core_id is null));
