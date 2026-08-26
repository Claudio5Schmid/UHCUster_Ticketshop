create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status text not null default 'neu' check (status in ('neu', 'rechnung_versendet', 'bezahlt', 'storniert')),
  refund_owed boolean not null default false,
  customer_id uuid not null references public.customers (id) on delete restrict,
  total_rappen integer not null default 0 check (total_rappen >= 0),
  source text not null default 'shop' check (source in ('shop', 'csv_import')),
  season text not null check (season ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create index orders_status_idx on public.orders (status);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_season_idx on public.orders (season);

create trigger set_orders_updated_at
  before update on public.orders
  for each row
  execute function public.set_updated_at();

create policy "Admins can view orders"
  on public.orders for select
  to authenticated
  using (public.is_admin());

comment on table public.orders is
  'One row per customer order. total_rappen is trigger-maintained from order_items, never app-supplied. status and refund_owed change only through the logged functions in create_admin_mutation_functions - there is no insert/update policy for anyone, deliberately: order creation and every status/refund change go through SECURITY DEFINER functions, never a bare write.';
