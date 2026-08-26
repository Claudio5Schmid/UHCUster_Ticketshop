create table public.scan_events (
  id uuid primary key default gen_random_uuid(),
  scanned_token text not null,
  -- Nullable: a forged/garbage scan never resolves to a real ticket, but must still
  -- be logged so the door staff's rejection reason is auditable.
  ticket_id uuid references public.tickets (id) on delete restrict,
  result text not null check (result in ('accepted', 'already_redeemed', 'invalid_signature', 'not_found', 'wrong_game', 'voided')),
  device_id text not null,
  scanned_at timestamptz not null default now()
);

alter table public.scan_events enable row level security;

create index scan_events_ticket_id_idx on public.scan_events (ticket_id);
create index scan_events_scanned_at_idx on public.scan_events (scanned_at);

create policy "Admins can view scan events"
  on public.scan_events for select
  to authenticated
  using (public.is_admin());

-- Provisional: assumes Phase 7 scanner devices authenticate via the same
-- admin_users-gated login (D15's flat access model). Revisit once Phase 7 designs
-- the real scanner-device auth path.
create policy "Admins can insert scan events"
  on public.scan_events for insert
  to authenticated
  with check (public.is_admin());

-- Append-only, enforced at the database level, not just by convention.
create or replace function public.prevent_scan_events_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'scan_events is append-only and cannot be updated or deleted';
end;
$$;

create trigger scan_events_no_update
  before update on public.scan_events
  for each row execute function public.prevent_scan_events_mutation();

create trigger scan_events_no_delete
  before delete on public.scan_events
  for each row execute function public.prevent_scan_events_mutation();

comment on table public.scan_events is
  'Append-only record of every scan attempt at the door, whether or not it resolved to a real ticket, including the device and the accept/reject reason. Never updated or deleted, even by admins.';
