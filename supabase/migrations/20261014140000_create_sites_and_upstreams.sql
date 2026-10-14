-- ============================================================
-- Migration: create_sites_and_upstreams
-- Purpose: Sites (Office/NOC, POP, ...) and upstream providers
--          (IIG, IPT, BDIX, CDN). OLTs and switches get a site, and a
--          switch port can carry an upstream instead of a reseller.
-- ============================================================

create type public.site_type as enum ('noc', 'office', 'pop', 'data_center', 'other');
create type public.upstream_kind as enum ('iig', 'ipt', 'bdix', 'cdn', 'other');

-- Sites
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  site_type public.site_type not null default 'pop',
  address text,
  latitude double precision,
  longitude double precision,
  contact_person text,
  phone text,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sites is 'Physical locations such as the Office/NOC, POPs and data centers that hold equipment';

-- Upstream providers
create table public.upstream_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.upstream_kind not null default 'iig',
  service text,
  circuit_id text,
  capacity_mbps integer check (capacity_mbps > 0),
  site_id uuid references public.sites(id) on delete set null,
  contact_person text,
  phone text,
  email text,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.upstream_providers is 'Providers we buy bandwidth or services from (IIG, IPT, BDIX, CDN/cache)';
comment on column public.upstream_providers.service is 'What the link carries, for example YouTube and Facebook';
comment on column public.upstream_providers.site_id is 'The site where the upstream link terminates';

-- Equipment belongs to a site
alter table public.olts
  add column site_id uuid references public.sites(id) on delete set null;
alter table public.network_switches
  add column site_id uuid references public.sites(id) on delete set null;

create index olts_site_id_idx on public.olts (site_id);
create index network_switches_site_id_idx on public.network_switches (site_id);
create index upstream_providers_site_id_idx on public.upstream_providers (site_id);

-- A switch port can carry an upstream (but never a reseller at the same time)
alter table public.switch_ports
  add column upstream_id uuid references public.upstream_providers(id) on delete set null;

alter table public.switch_ports
  add constraint switch_ports_one_service
  check (reseller_id is null or upstream_id is null);

create index switch_ports_upstream_id_idx on public.switch_ports (upstream_id);

-- A port with a cable, reseller or upstream is no longer "free"
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

  if (new.cable_id is not null or new.reseller_id is not null or new.upstream_id is not null)
     and new.status = 'free' then
    new.status := 'active';
  end if;

  return new;
end;
$$;

-- Row level security
alter table public.sites enable row level security;
alter table public.upstream_providers enable row level security;

create policy "sites_select_authenticated" on public.sites
  for select to authenticated using (true);
create policy "sites_insert_staff" on public.sites
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "sites_update_staff" on public.sites
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "sites_delete_admin_manager" on public.sites
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

create policy "upstream_providers_select_authenticated" on public.upstream_providers
  for select to authenticated using (true);
create policy "upstream_providers_insert_staff" on public.upstream_providers
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "upstream_providers_update_staff" on public.upstream_providers
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));
create policy "upstream_providers_delete_admin_manager" on public.upstream_providers
  for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- updated_at and audit history
create trigger set_sites_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();
create trigger set_upstream_providers_updated_at
  before update on public.upstream_providers
  for each row execute function public.set_updated_at();

create trigger audit_sites
  after insert or update or delete on public.sites
  for each row execute function public.log_audit_event();
create trigger audit_upstream_providers
  after insert or update or delete on public.upstream_providers
  for each row execute function public.log_audit_event();

-- Faults and photos can be attached to the new kinds of record later
alter type public.network_entity_type add value if not exists 'site';
alter type public.network_entity_type add value if not exists 'network_switch';
alter type public.network_entity_type add value if not exists 'reseller';
alter type public.network_entity_type add value if not exists 'upstream_provider';
