create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('order', 'ticket', 'product')),
  -- Polymorphic reference (order/ticket/product), so no FK constraint on entity_id -
  -- an accepted trade-off on an append-only log, see docs/DECISIONS.md D18 note.
  entity_id uuid not null,
  action text not null,
  field_name text,
  old_value text,
  new_value text,
  actor_type text not null check (actor_type in ('admin', 'system')),
  actor_admin_id uuid references public.admin_users (user_id),
  note text,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at);

create policy "Admins can view audit log"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- Append-only, enforced at the database level.
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only and cannot be updated or deleted';
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.prevent_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.prevent_audit_log_mutation();

comment on table public.audit_log is
  'Generic append-only trail covering order status/refund transitions (including the automatic 14-day cancellation, actor_type = system), ticket holder-name changes and reissues, and non-price product edits. No insert policy for anyone: populated exclusively by the SECURITY DEFINER functions in create_admin_mutation_functions and create_auto_cancel_stale_orders.';
