-- ============================================================
-- Migration: olt_monitoring
-- Purpose: Monitor OLTs and ONUs (status, optical power, history, events),
--          keep OLT logins encrypted in Supabase Vault, and queue commands
--          for the collector program to run.
-- ============================================================

create type public.olt_driver as enum
  ('simulator', 'bdcom', 'vsol', 'huawei', 'zte', 'airmedia', 'other');
create type public.pon_tech as enum ('epon', 'gpon', 'xgspon', 'mixed');
create type public.olt_access_method as enum ('snmp', 'ssh', 'telnet', 'web');
create type public.onu_state as enum
  ('online', 'offline', 'los', 'dying_gasp', 'power_off', 'unknown');
create type public.olt_command_kind as enum
  ('refresh', 'reboot_onu', 'disable_onu', 'enable_onu', 'rename_onu', 'delete_onu', 'transfer_onu');
create type public.olt_command_status as enum ('queued', 'running', 'done', 'failed', 'cancelled');

-- How to reach each OLT (no secrets here)
create table public.olt_connections (
  olt_id uuid primary key references public.olts(id) on delete cascade,
  host text not null,
  driver public.olt_driver not null default 'other',
  tech public.pon_tech not null default 'gpon',
  method public.olt_access_method not null default 'snmp',
  snmp_port integer not null default 161 check (snmp_port between 1 and 65535),
  ssh_port integer not null default 22 check (ssh_port between 1 and 65535),
  telnet_port integer not null default 23 check (telnet_port between 1 and 65535),
  web_url text,
  poll_interval_seconds integer not null default 60 check (poll_interval_seconds >= 15),
  enabled boolean not null default true,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Logins live in Vault; this table only holds the secret ids.
-- No policy is created, so nobody can read it through the API.
create table public.olt_credentials (
  olt_id uuid primary key references public.olts(id) on delete cascade,
  username text,
  password_secret uuid,
  snmp_secret uuid,
  enable_secret uuid,
  updated_at timestamptz not null default now()
);

-- Live state of each OLT, written by the collector
create table public.olt_status (
  olt_id uuid primary key references public.olts(id) on delete cascade,
  reachable boolean not null default false,
  last_poll_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  response_ms integer,
  uptime_seconds bigint,
  cpu_percent numeric(5, 2),
  temperature_c numeric(5, 2),
  updated_at timestamptz not null default now()
);

-- Every ONU the OLT reports
create table public.olt_onus (
  id uuid primary key default gen_random_uuid(),
  olt_id uuid not null references public.olts(id) on delete cascade,
  pon_port text not null,
  onu_no integer,
  ident text not null,
  name text,
  model text,
  status public.onu_state not null default 'unknown',
  rx_power_dbm numeric(6, 2),
  olt_rx_power_dbm numeric(6, 2),
  temperature_c numeric(5, 2),
  distance_m integer,
  offline_reason text,
  last_online_at timestamptz,
  last_offline_at timestamptz,
  customer_id uuid references public.customers(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (olt_id, ident)
);

comment on column public.olt_onus.ident is 'Serial number (GPON) or MAC address (EPON)';
comment on column public.olt_onus.rx_power_dbm is 'Power received at the ONU, in dBm';
comment on column public.olt_onus.olt_rx_power_dbm is 'Power the OLT receives from the ONU, in dBm';

create index olt_onus_olt_status_idx on public.olt_onus (olt_id, status);
create index olt_onus_customer_idx on public.olt_onus (customer_id);

-- Power and status over time (the collector writes on change and every 15 minutes)
create table public.onu_power_history (
  id bigint generated always as identity primary key,
  onu_id uuid not null references public.olt_onus(id) on delete cascade,
  at timestamptz not null default now(),
  status public.onu_state not null,
  rx_power_dbm numeric(6, 2),
  olt_rx_power_dbm numeric(6, 2)
);
create index onu_power_history_onu_at_idx on public.onu_power_history (onu_id, at desc);

-- Alerts and changes
create table public.onu_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  olt_id uuid not null references public.olts(id) on delete cascade,
  onu_id uuid references public.olt_onus(id) on delete set null,
  kind text not null,
  severity text not null default 'info',
  detail text
);
create index onu_events_at_idx on public.onu_events (at desc);
create index onu_events_olt_at_idx on public.onu_events (olt_id, at desc);

-- Work for the collector to do
create table public.olt_commands (
  id uuid primary key default gen_random_uuid(),
  olt_id uuid not null references public.olts(id) on delete cascade,
  onu_id uuid references public.olt_onus(id) on delete set null,
  kind public.olt_command_kind not null,
  params jsonb not null default '{}'::jsonb,
  status public.olt_command_status not null default 'queued',
  requested_by uuid references public.profiles(id) default auth.uid(),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  result text
);
create index olt_commands_queue_idx on public.olt_commands (status, requested_at);

-- updated_at
create trigger set_olt_connections_updated_at
  before update on public.olt_connections
  for each row execute function public.set_updated_at();
create trigger set_olt_onus_updated_at
  before update on public.olt_onus
  for each row execute function public.set_updated_at();

-- Row level security
alter table public.olt_connections enable row level security;
alter table public.olt_credentials enable row level security;
alter table public.olt_status enable row level security;
alter table public.olt_onus enable row level security;
alter table public.onu_power_history enable row level security;
alter table public.onu_events enable row level security;
alter table public.olt_commands enable row level security;

revoke all on public.olt_credentials from anon, authenticated;

create policy "olt_connections_select" on public.olt_connections
  for select to authenticated using (true);
create policy "olt_connections_insert" on public.olt_connections
  for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager'));
create policy "olt_connections_update" on public.olt_connections
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager'));
create policy "olt_connections_delete" on public.olt_connections
  for delete to authenticated
  using (public.get_my_role() = 'admin');

create policy "olt_status_select" on public.olt_status
  for select to authenticated using (true);
create policy "olt_onus_select" on public.olt_onus
  for select to authenticated using (true);
create policy "onu_power_history_select" on public.onu_power_history
  for select to authenticated using (true);
create policy "onu_events_select" on public.onu_events
  for select to authenticated using (true);

-- Staff may link an ONU to a customer; the collector owns every other column
create policy "olt_onus_update_staff" on public.olt_onus
  for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'))
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));
revoke update on public.olt_onus from anon, authenticated;
grant update (customer_id) on public.olt_onus to authenticated;

create policy "olt_commands_select" on public.olt_commands
  for select to authenticated using (true);
create policy "olt_commands_insert" on public.olt_commands
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and (
      public.get_my_role() in ('admin', 'manager')
      or (
        public.get_my_role() = 'technician'
        and kind in ('refresh', 'reboot_onu', 'enable_onu', 'disable_onu', 'rename_onu')
      )
    )
  );

-- Live updates in the browser
alter publication supabase_realtime add table
  public.olt_status, public.olt_onus, public.onu_events, public.olt_commands;

-- Counts per OLT for the dashboard. "weak" means below -25 dBm or above -8 dBm.
create or replace view public.olt_onu_summary
with (security_invoker = on) as
select
  olt_id,
  count(*)::int as total,
  (count(*) filter (where status = 'online'))::int as online,
  (count(*) filter (where status = 'offline'))::int as offline,
  (count(*) filter (where status in ('los', 'dying_gasp', 'power_off')))::int as alarm,
  (count(*) filter (
    where status = 'online' and rx_power_dbm is not null
      and (rx_power_dbm < -25 or rx_power_dbm > -8)
  ))::int as weak,
  round(avg(rx_power_dbm) filter (where status = 'online'), 1) as avg_rx,
  min(rx_power_dbm) filter (where status = 'online') as worst_rx
from public.olt_onus
group by olt_id;

-- ---------- logins ----------

-- Save or change a login. Admins only. Leave a secret empty to keep the old one.
create or replace function public.set_olt_credentials(
  p_olt_id uuid,
  p_username text,
  p_password text default null,
  p_snmp_community text default null,
  p_enable_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  cur public.olt_credentials%rowtype;
  v_pw uuid;
  v_snmp uuid;
  v_en uuid;
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'Only an admin can change OLT logins';
  end if;

  select * into cur from public.olt_credentials where olt_id = p_olt_id;
  v_pw := cur.password_secret;
  v_snmp := cur.snmp_secret;
  v_en := cur.enable_secret;

  if p_password is not null and p_password <> '' then
    if v_pw is null then
      v_pw := vault.create_secret(p_password, 'olt_' || p_olt_id || '_password');
    else
      perform vault.update_secret(v_pw, p_password);
    end if;
  end if;

  if p_snmp_community is not null and p_snmp_community <> '' then
    if v_snmp is null then
      v_snmp := vault.create_secret(p_snmp_community, 'olt_' || p_olt_id || '_snmp');
    else
      perform vault.update_secret(v_snmp, p_snmp_community);
    end if;
  end if;

  if p_enable_password is not null and p_enable_password <> '' then
    if v_en is null then
      v_en := vault.create_secret(p_enable_password, 'olt_' || p_olt_id || '_enable');
    else
      perform vault.update_secret(v_en, p_enable_password);
    end if;
  end if;

  insert into public.olt_credentials
    (olt_id, username, password_secret, snmp_secret, enable_secret, updated_at)
  values (p_olt_id, nullif(p_username, ''), v_pw, v_snmp, v_en, now())
  on conflict (olt_id) do update
    set username = excluded.username,
        password_secret = excluded.password_secret,
        snmp_secret = excluded.snmp_secret,
        enable_secret = excluded.enable_secret,
        updated_at = now();
end;
$$;

-- What is saved, without the secrets themselves
create or replace function public.get_olt_credential_status(p_olt_id uuid)
returns table (username text, has_password boolean, has_snmp boolean, has_enable boolean)
language sql
security definer
stable
set search_path = public
as $$
  select c.username,
         c.password_secret is not null,
         c.snmp_secret is not null,
         c.enable_secret is not null
  from public.olt_credentials c
  where c.olt_id = p_olt_id
    and public.get_my_role() in ('admin', 'manager');
$$;

create or replace function public.clear_olt_credentials(p_olt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() <> 'admin' then
    raise exception 'Only an admin can remove OLT logins';
  end if;
  delete from public.olt_credentials where olt_id = p_olt_id;
end;
$$;

-- Delete the Vault secrets together with the login row
create or replace function public.olt_credentials_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets
  where id in (old.password_secret, old.snmp_secret, old.enable_secret);
  return old;
end;
$$;

create trigger olt_credentials_cleanup
  before delete on public.olt_credentials
  for each row execute function public.olt_credentials_cleanup();

-- Only the collector (service role) may read the real secrets
create or replace function public.collector_get_credentials(p_olt_id uuid)
returns table (username text, password text, snmp_community text, enable_password text)
language sql
security definer
stable
set search_path = public, vault
as $$
  select c.username,
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.password_secret),
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.snmp_secret),
         (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.enable_secret)
  from public.olt_credentials c
  where c.olt_id = p_olt_id;
$$;

-- Keep the history table from growing forever
create or replace function public.prune_onu_history(p_days integer default 90)
returns void
language sql
set search_path = public
as $$
  delete from public.onu_power_history where at < now() - make_interval(days => p_days);
  delete from public.onu_events where at < now() - make_interval(days => p_days * 2);
$$;

revoke execute on function public.set_olt_credentials(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_olt_credentials(uuid, text, text, text, text) to authenticated;
revoke execute on function public.get_olt_credential_status(uuid) from public, anon;
grant execute on function public.get_olt_credential_status(uuid) to authenticated;
revoke execute on function public.clear_olt_credentials(uuid) from public, anon;
grant execute on function public.clear_olt_credentials(uuid) to authenticated;
revoke execute on function public.olt_credentials_cleanup() from public, anon, authenticated;
revoke execute on function public.collector_get_credentials(uuid) from public, anon, authenticated;
grant execute on function public.collector_get_credentials(uuid) to service_role;
revoke execute on function public.prune_onu_history(integer) from public, anon, authenticated;
grant execute on function public.prune_onu_history(integer) to service_role;
