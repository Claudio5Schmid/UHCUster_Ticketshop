create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  order_item_id uuid not null references public.order_items (id) on delete restrict,
  -- Denormalized copy of order_items.product_id: lets the scanner's pre-doors-open
  -- bulk download read the valid-ticket set without joining through order_items.
  product_id uuid not null references public.products (id) on delete restrict,
  season text not null check (season ~ '^[0-9]{4}$'),
  holder_name text,
  transferable boolean not null default false,
  status text not null default 'gueltig' check (status in ('gueltig', 'eingeloest', 'storniert', 'ersetzt')),
  replaces_ticket_id uuid unique references public.tickets (id),
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tickets enable row level security;

create index tickets_token_idx on public.tickets (token);
create index tickets_order_item_id_idx on public.tickets (order_item_id);
create index tickets_product_id_idx on public.tickets (product_id);
create index tickets_season_status_idx on public.tickets (season, status);

create trigger set_tickets_updated_at
  before update on public.tickets
  for each row
  execute function public.set_updated_at();

create policy "Admins can view tickets"
  on public.tickets for select
  to authenticated
  using (public.is_admin());

comment on table public.tickets is
  'One row per issued season pass or membership pass. holder_name is a real person for personal passes, or a shared label (e.g. "Firma Accum") for transferable Red Castle Club batches. A lost ticket is never deleted - it is voided (status ersetzt) and linked to its replacement via replaces_ticket_id. No insert/update policy for anyone: issuance, holder-name changes, and reissues all go through the SECURITY DEFINER functions in create_admin_mutation_functions, so the audit trail can never be bypassed by a stray write.';
