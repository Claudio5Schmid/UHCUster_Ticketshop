create table public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  price_rappen integer not null check (price_rappen >= 0),
  previous_price_rappen integer check (previous_price_rappen >= 0),
  changed_by uuid references public.admin_users (user_id),
  changed_at timestamptz not null default now()
);

alter table public.price_history enable row level security;

create index price_history_product_id_changed_at_idx
  on public.price_history (product_id, changed_at desc);

create policy "Admins can view price history"
  on public.price_history for select
  to authenticated
  using (public.is_admin());

-- Append-only: no insert/update/delete policy exists for anyone (not even admins) -
-- this table is populated exclusively by the trigger below - and update/delete are
-- additionally blocked outright so even a service-role connection can't touch a row.
create or replace function public.prevent_price_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'price_history is append-only and cannot be updated or deleted';
end;
$$;

create trigger price_history_no_update
  before update on public.price_history
  for each row execute function public.prevent_price_history_mutation();

create trigger price_history_no_delete
  before delete on public.price_history
  for each row execute function public.prevent_price_history_mutation();

-- Automatically logs every price change, and seeds the first row at product creation,
-- so "current price" history is always complete from day one.
create or replace function public.log_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.price_history (product_id, price_rappen, previous_price_rappen, changed_by)
    values (new.id, new.price_rappen, null, auth.uid());
  elsif tg_op = 'UPDATE' and new.price_rappen is distinct from old.price_rappen then
    insert into public.price_history (product_id, price_rappen, previous_price_rappen, changed_by)
    values (new.id, new.price_rappen, old.price_rappen, auth.uid());
  end if;
  return new;
end;
$$;

create trigger products_log_price_on_insert
  after insert on public.products
  for each row execute function public.log_price_change();

create trigger products_log_price_on_update
  after update of price_rappen on public.products
  for each row execute function public.log_price_change();

comment on table public.price_history is
  'Append-only ledger of every price a product has ever had. Populated only by triggers on products - never writable directly, even by admins - so a price is never silently overwritten.';
