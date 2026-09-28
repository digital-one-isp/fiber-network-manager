-- ============================================================
-- Migration: fix_remaining_advisor_warnings
-- Purpose: Finish locking down get_my_role() (previous migration's
--          REVOKE from anon didn't fully take effect because PUBLIC
--          still had an implicit grant); attempt the same for the
--          Supabase-managed rls_auto_enable() function, tolerating
--          a permission error since we may not own it.
-- ============================================================

-- 1. Revoke the default PUBLIC execute grant, then explicitly grant
--    only to 'authenticated' (RLS policies run as this role).
revoke execute on function public.get_my_role() from public;
revoke execute on function public.get_my_role() from anon;
grant execute on function public.get_my_role() to authenticated;

-- 2. rls_auto_enable() belongs to Supabase's own infrastructure
--    (created by the "automatic RLS" project toggle), so we likely
--    don't own it. Attempt to revoke public execute; ignore if we
--    lack permission rather than failing the whole migration.
do $$
begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception
  when insufficient_privilege then
    raise notice 'Skipped rls_auto_enable(): not owned by this role, managed by Supabase.';
end;
$$;
