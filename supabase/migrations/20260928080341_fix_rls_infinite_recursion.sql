-- ============================================================
-- Migration: fix_rls_infinite_recursion
-- Purpose: Replace all "exists (select ... from profiles)" role
--          checks inside RLS policies with a SECURITY DEFINER
--          function. Subqueries into profiles from a policy
--          re-trigger profiles' own RLS policies, causing
--          "infinite recursion detected in policy for relation
--          profiles". A SECURITY DEFINER function bypasses RLS
--          safely, since it only ever returns the caller's own role.
-- ============================================================

-- 1. Helper function: returns the current user's role, bypassing RLS
create or replace function public.get_my_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

comment on function public.get_my_role() is 'Returns the calling user''s role; SECURITY DEFINER avoids RLS recursion when used inside policies';

-- 2. profiles: fix the two recursive policies
drop policy "profiles_select_admin_manager" on public.profiles;
create policy "profiles_select_admin_manager"
  on public.profiles for select
  to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

drop policy "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.get_my_role() = 'admin');

-- 3. olts
drop policy "olts_insert_staff" on public.olts;
create policy "olts_insert_staff" on public.olts for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "olts_update_staff" on public.olts;
create policy "olts_update_staff" on public.olts for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "olts_delete_admin_manager" on public.olts;
create policy "olts_delete_admin_manager" on public.olts for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 4. fiber_cables
drop policy "fiber_cables_insert_staff" on public.fiber_cables;
create policy "fiber_cables_insert_staff" on public.fiber_cables for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "fiber_cables_update_staff" on public.fiber_cables;
create policy "fiber_cables_update_staff" on public.fiber_cables for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "fiber_cables_delete_admin_manager" on public.fiber_cables;
create policy "fiber_cables_delete_admin_manager" on public.fiber_cables for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 5. fiber_cores
drop policy "fiber_cores_insert_staff" on public.fiber_cores;
create policy "fiber_cores_insert_staff" on public.fiber_cores for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "fiber_cores_update_staff" on public.fiber_cores;
create policy "fiber_cores_update_staff" on public.fiber_cores for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "fiber_cores_delete_admin_manager" on public.fiber_cores;
create policy "fiber_cores_delete_admin_manager" on public.fiber_cores for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 6. tg_boxes
drop policy "tg_boxes_insert_staff" on public.tg_boxes;
create policy "tg_boxes_insert_staff" on public.tg_boxes for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "tg_boxes_update_staff" on public.tg_boxes;
create policy "tg_boxes_update_staff" on public.tg_boxes for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "tg_boxes_delete_admin_manager" on public.tg_boxes;
create policy "tg_boxes_delete_admin_manager" on public.tg_boxes for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 7. splice_points
drop policy "splice_points_insert_staff" on public.splice_points;
create policy "splice_points_insert_staff" on public.splice_points for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splice_points_update_staff" on public.splice_points;
create policy "splice_points_update_staff" on public.splice_points for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splice_points_delete_admin_manager" on public.splice_points;
create policy "splice_points_delete_admin_manager" on public.splice_points for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 8. splices
drop policy "splices_insert_staff" on public.splices;
create policy "splices_insert_staff" on public.splices for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splices_update_staff" on public.splices;
create policy "splices_update_staff" on public.splices for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splices_delete_admin_manager" on public.splices;
create policy "splices_delete_admin_manager" on public.splices for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 9. splitters
drop policy "splitters_insert_staff" on public.splitters;
create policy "splitters_insert_staff" on public.splitters for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splitters_update_staff" on public.splitters;
create policy "splitters_update_staff" on public.splitters for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splitters_delete_admin_manager" on public.splitters;
create policy "splitters_delete_admin_manager" on public.splitters for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 10. splitter_ports
drop policy "splitter_ports_insert_staff" on public.splitter_ports;
create policy "splitter_ports_insert_staff" on public.splitter_ports for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splitter_ports_update_staff" on public.splitter_ports;
create policy "splitter_ports_update_staff" on public.splitter_ports for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "splitter_ports_delete_admin_manager" on public.splitter_ports;
create policy "splitter_ports_delete_admin_manager" on public.splitter_ports for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 11. customers
drop policy "customers_insert_staff" on public.customers;
create policy "customers_insert_staff" on public.customers for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "customers_update_staff" on public.customers;
create policy "customers_update_staff" on public.customers for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "customers_delete_admin_manager" on public.customers;
create policy "customers_delete_admin_manager" on public.customers for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 12. customer_connections
drop policy "customer_connections_insert_staff" on public.customer_connections;
create policy "customer_connections_insert_staff" on public.customer_connections for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "customer_connections_update_staff" on public.customer_connections;
create policy "customer_connections_update_staff" on public.customer_connections for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "customer_connections_delete_admin_manager" on public.customer_connections;
create policy "customer_connections_delete_admin_manager" on public.customer_connections for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 13. faults
drop policy "faults_insert_staff" on public.faults;
create policy "faults_insert_staff" on public.faults for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "faults_update_staff" on public.faults;
create policy "faults_update_staff" on public.faults for update to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "faults_delete_admin_manager" on public.faults;
create policy "faults_delete_admin_manager" on public.faults for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager'));

-- 14. photos
drop policy "photos_insert_staff" on public.photos;
create policy "photos_insert_staff" on public.photos for insert to authenticated
  with check (public.get_my_role() in ('admin', 'manager', 'technician'));

drop policy "photos_delete_staff" on public.photos;
create policy "photos_delete_staff" on public.photos for delete to authenticated
  using (public.get_my_role() in ('admin', 'manager', 'technician'));

-- 15. audit_logs
drop policy "audit_logs_select_admin_manager" on public.audit_logs;
create policy "audit_logs_select_admin_manager" on public.audit_logs for select to authenticated
  using (public.get_my_role() in ('admin', 'manager'));
