create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  type text not null check (type in ('season_pass', 'membership')),
  price_rappen integer not null check (price_rappen >= 0),
  tier_level smallint not null default 0 check (tier_level >= 0),
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  valid_season text not null check (valid_season ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create index products_active_sort_order_idx
  on public.products (sort_order)
  where active = true;

create trigger set_products_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- The one public policy in the whole schema.
create policy "Anyone can view active products"
  on public.products for select
  to anon, authenticated
  using (active = true);

create policy "Admins can view all products"
  on public.products for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert products"
  on public.products for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update products"
  on public.products for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.products is
  'Season-pass and Red Castle Club membership variants. tier_level drives the price-dependent visual treatment; products are deactivated, never deleted, so historical orders always resolve to a real product. price_rappen changes are picked up automatically by the price_history trigger (next migrations); non-price edits go through update_product_details().';
