-- ============================================================
-- Migration: create_customer_tables
-- Purpose: Customers (GPS location, contact info) and their
--          physical connection to a splitter port (ONU/drop cable)
-- ============================================================

-- 1. Customer status enum
create type public.customer_status as enum ('active', 'inactive', 'suspended', 'pending');

-- 2. Customers table
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  package_name text,
  status public.customer_status not null default 'pending',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is 'ISP customers with GPS location for map display and field survey';

-- 3. Customer connections table: links a customer to a splitter port
create table public.customer_connections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  splitter_port_id uuid references public.splitter_ports(id) on delete set null,
  onu_serial_number text,
  drop_cable_length_meters numeric(8, 2),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  status public.equipment_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (splitter_port_id)
);

comment on table public.customer_connections is 'Physical connection record: which splitter port feeds which customer, via ONU/drop cable';
comment on column public.customer_connections.disconnected_at is 'Set when the connection is terminated, keeping history instead of deleting the row';

-- 4. Enable RLS
alter table public.customers enable row level security;
alter table public.customer_connections enable row level security;

-- 5. Policies: customers
create policy "customers_select_authenticated"
  on public.customers for select
  to authenticated
  using (true);

create policy "customers_insert_staff"
  on public.customers for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "customers_update_staff"
  on public.customers for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "customers_delete_admin_manager"
  on public.customers for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 6. Policies: customer_connections
create policy "customer_connections_select_authenticated"
  on public.customer_connections for select
  to authenticated
  using (true);

create policy "customer_connections_insert_staff"
  on public.customer_connections for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "customer_connections_update_staff"
  on public.customer_connections for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "customer_connections_delete_admin_manager"
  on public.customer_connections for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- 7. updated_at triggers
create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger set_customer_connections_updated_at
  before update on public.customer_connections
  for each row execute function public.set_updated_at();

-- 8. Indexes
create index customers_lat_lng_idx on public.customers (latitude, longitude);
create index customer_connections_customer_id_idx on public.customer_connections (customer_id);
create index customer_connections_splitter_port_id_idx on public.customer_connections (splitter_port_id);

-- 9. When a customer gets a connection, mark the splitter port as "used"
create function public.mark_splitter_port_used()
returns trigger
language plpgsql
as $$
begin
  if new.splitter_port_id is not null then
    update public.splitter_ports
    set status = 'used'
    where id = new.splitter_port_id;
  end if;
  return new;
end;
$$;

create trigger on_customer_connection_created
  after insert on public.customer_connections
  for each row execute function public.mark_splitter_port_used();

-- 10. When a connection is marked disconnected, free the splitter port back up
create function public.free_splitter_port_on_disconnect()
returns trigger
language plpgsql
as $$
begin
  if new.disconnected_at is not null and old.disconnected_at is null and new.splitter_port_id is not null then
    update public.splitter_ports
    set status = 'free'
    where id = new.splitter_port_id;
  end if;
  return new;
end;
$$;

create trigger on_customer_connection_disconnected
  after update on public.customer_connections
  for each row execute function public.free_splitter_port_on_disconnect();
