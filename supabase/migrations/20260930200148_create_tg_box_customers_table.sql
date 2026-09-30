-- ============================================================
-- Migration: create_tg_box_customers_table
-- Purpose: Link a TG/joint box (typically a "splitter_customer" box)
--          directly to one or more customers, optionally noting
--          which core inside the box feeds that customer.
-- ============================================================

create table public.tg_box_customers (
  id uuid primary key default gen_random_uuid(),
  tg_box_id uuid not null references public.tg_boxes(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  core_id uuid references public.fiber_cores(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tg_box_id, customer_id)
);

comment on table public.tg_box_customers is 'Links a TG/joint box (typically a customer splitter box) directly to the customers it serves, optionally noting which core feeds each one';

alter table public.tg_box_customers enable row level security;

create policy "tg_box_customers_select_authenticated"
  on public.tg_box_customers for select
  to authenticated
  using (true);

create policy "tg_box_customers_insert_staff"
  on public.tg_box_customers for insert
  to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

create policy "tg_box_customers_delete_staff"
  on public.tg_box_customers for delete
  to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

create index tg_box_customers_tg_box_id_idx on public.tg_box_customers (tg_box_id);
create index tg_box_customers_customer_id_idx on public.tg_box_customers (customer_id);
