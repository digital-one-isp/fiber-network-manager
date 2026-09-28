-- ============================================================
-- Migration: fix_security_advisor_warnings
-- Purpose: Address Supabase security/performance advisor warnings:
--          1. Set explicit search_path on functions missing it
--          2. Restrict direct RPC execution of internal trigger-only
--             functions and tighten anon access to get_my_role
--          3. Wrap auth.uid() in (select ...) in profiles RLS
--             policies to avoid per-row re-evaluation
--          4. Merge duplicate permissive policies on profiles
-- ============================================================

-- 1. Fix mutable search_path on trigger/helper functions
alter function public.mark_splitter_port_used() set search_path = public;
alter function public.free_splitter_port_on_disconnect() set search_path = public;
alter function public.set_fault_resolved_at() set search_path = public;
alter function public.generate_fiber_cores() set search_path = public;
alter function public.generate_splitter_ports() set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- 2a. handle_new_user and log_audit_event are only meant to run via
--     triggers (as the table owner), never called directly over the
--     API. Revoke direct RPC execution.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_audit_event() from public, anon, authenticated;

-- 2b. get_my_role() must stay executable by 'authenticated' (RLS
--     policies rely on it), but anonymous (logged-out) users have no
--     auth.uid() and no legitimate reason to call it directly.
revoke execute on function public.get_my_role() from anon;

-- Note: rls_auto_enable() is a Supabase-managed system function
-- (from the "automatic RLS" project setting) and is left untouched.

-- 3 & 4. Rebuild profiles SELECT and UPDATE policies: merge the two
--        permissive policies per action into one, and use
--        (select auth.uid()) so it's evaluated once per query
--        instead of once per row.
drop policy "profiles_select_own" on public.profiles;
drop policy "profiles_select_admin_manager" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or public.get_my_role() in ('admin', 'manager')
  );

drop policy "profiles_update_own" on public.profiles;
drop policy "profiles_update_admin" on public.profiles;
create policy "profiles_update"
  on public.profiles for update
  to authenticated
  using (
    (select auth.uid()) = id
    or public.get_my_role() = 'admin'
  )
  with check (
    (select auth.uid()) = id
    or public.get_my_role() = 'admin'
  );
