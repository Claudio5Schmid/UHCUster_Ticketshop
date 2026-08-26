create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address_street text not null,
  address_zip text not null,
  address_city text not null,
  address_country text not null default 'CH',
  email text not null,
  phone text not null,
  membership_number text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

create trigger set_customers_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

create policy "Admins can view customers"
  on public.customers for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert customers"
  on public.customers for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins can update customers"
  on public.customers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.customers is
  'Contact and address details for the person/entity an order belongs to, with an optional membership number for club members imported via CSV. Admin-managed only; no anon access, no delete policy.';
