-- ============================================================
-- Migration: extend_olt_ports
-- Purpose: An OLT also has SFP (1G/10G) and RJ45 ports besides the PON
--          ports. olt_uplinks now holds all of these non-PON ports.
-- ============================================================

create type public.olt_port_role as enum ('uplink', 'management', 'other');

alter table public.olt_uplinks
  add column media public.port_media not null default 'sfp_plus',
  add column role public.olt_port_role not null default 'uplink',
  add column status public.switch_port_status not null default 'free';

update public.olt_uplinks set status = 'active' where switch_port_id is not null;

comment on table public.olt_uplinks is 'The non-PON ports of an OLT (SFP, SFP+ and RJ45 uplink or management ports) and the switch port each one connects to';

create or replace function public.prepare_olt_uplink()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.switch_port_id is not null and new.status = 'free' then
    new.status := 'active';
  end if;
  return new;
end;
$$;

create trigger olt_uplinks_prepare
  before insert or update on public.olt_uplinks
  for each row execute function public.prepare_olt_uplink();
