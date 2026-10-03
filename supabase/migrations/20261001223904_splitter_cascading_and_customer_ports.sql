-- ============================================================
-- Migration: splitter_cascading_and_customer_ports
-- Purpose: Allow a splitter to be fed either by a fiber core
--          (normal case) or by another splitter's output port
--          (cascaded splitter, e.g. 1:8 -> one port -> 1:4).
--          Also auto-mark the parent port as 'used' when a child
--          splitter is attached to it (mirrors customer_connections).
-- ============================================================

-- 1. New column: this splitter can be fed from a splitter_port
--    instead of (or in addition to being identified by) a core.
alter table public.splitters
  add column parent_port_id uuid references public.splitter_ports(id) on delete set null;

comment on column public.splitters.parent_port_id is 'If this splitter is cascaded from another splitter, the output port of the parent splitter that feeds it';

create index splitters_parent_port_id_idx on public.splitters (parent_port_id);

-- A splitter is fed by at most one source: a core OR a parent port, not both
alter table public.splitters
  add constraint splitters_single_feed_source
  check (input_core_id is null or parent_port_id is null);

-- 2. When a cascaded splitter is created/updated with a parent_port_id,
--    mark that parent port as 'used'.
create or replace function public.mark_parent_port_used()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.parent_port_id is not null then
    update public.splitter_ports
    set status = 'used'
    where id = new.parent_port_id;
  end if;
  return new;
end;
$$;

create trigger on_splitter_parent_port_set
  after insert or update of parent_port_id on public.splitters
  for each row execute function public.mark_parent_port_used();
