-- ============================================================
-- Migration: create_photos_and_audit_logs_tables
-- Purpose: Photos (field survey images against any entity) and
--          audit_logs (change history across key tables)
-- ============================================================

-- 1. Photos table (polymorphic, same pattern as faults)
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  entity_type public.network_entity_type not null,
  entity_id uuid not null,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table public.photos is 'Field survey / documentation photos attached to any network entity';
comment on column public.photos.storage_path is 'Path within the Supabase Storage bucket, e.g. "olts/<id>/photo1.jpg"';

alter table public.photos enable row level security;

create policy "photos_select_authenticated"
  on public.photos for select
  to authenticated
  using (true);

create policy "photos_insert_staff"
  on public.photos for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create policy "photos_delete_staff"
  on public.photos for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager', 'technician'))
  );

create index photos_entity_idx on public.photos (entity_type, entity_id);

-- 2. Audit logs table
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now()
);

comment on table public.audit_logs is 'Change history: row-level before/after snapshot for every insert/update/delete on tracked tables';

alter table public.audit_logs enable row level security;

-- Only admin/manager can read audit history
create policy "audit_logs_select_admin_manager"
  on public.audit_logs for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'manager'))
  );

-- No one inserts/updates/deletes audit_logs directly; only the trigger function does (security definer)
create index audit_logs_table_record_idx on public.audit_logs (table_name, record_id);
create index audit_logs_changed_at_idx on public.audit_logs (changed_at desc);

-- 3. Generic audit trigger function
create function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, new_data, changed_by)
    values (tg_table_name, new.id, 'INSERT', to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, changed_by)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), auth.uid());
    return old;
  end if;
  return null;
end;
$$;

-- 4. Attach audit trigger to the high-value tables
create trigger audit_olts
  after insert or update or delete on public.olts
  for each row execute function public.log_audit_event();

create trigger audit_fiber_cables
  after insert or update or delete on public.fiber_cables
  for each row execute function public.log_audit_event();

create trigger audit_tg_boxes
  after insert or update or delete on public.tg_boxes
  for each row execute function public.log_audit_event();

create trigger audit_splitters
  after insert or update or delete on public.splitters
  for each row execute function public.log_audit_event();

create trigger audit_customers
  after insert or update or delete on public.customers
  for each row execute function public.log_audit_event();

create trigger audit_customer_connections
  after insert or update or delete on public.customer_connections
  for each row execute function public.log_audit_event();

create trigger audit_faults
  after insert or update or delete on public.faults
  for each row execute function public.log_audit_event();
