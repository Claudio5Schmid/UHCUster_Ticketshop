create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_rappen integer not null check (unit_price_rappen >= 0),
  quantity integer not null default 1 check (quantity >= 1),
  -- Collected at checkout, before a ticket row exists: a person's name for a normal
  -- (quantity = 1) personal pass, or a shared label (e.g. a company name) for a
  -- transferable batch with quantity > 1 (Red Castle Club bundles). Copied onto each
  -- resulting `tickets.holder_name` at issuance time (Phase 6), not decided here.
  holder_name text,
  line_total_rappen integer generated always as (quantity * unit_price_rappen) stored,
  created_at timestamptz not null default now()
);

alter table public.order_items enable row level security;

create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

create policy "Admins can view order items"
  on public.order_items for select
  to authenticated
  using (public.is_admin());

-- Keeps orders.total_rappen in sync with its line items - removes stored-total drift
-- as a bug class entirely, rather than trusting the application to compute it.
create or replace function public.recalculate_order_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.order_id, old.order_id);

  update public.orders
  set total_rappen = (
    select coalesce(sum(line_total_rappen), 0)
    from public.order_items
    where order_id = v_order_id
  )
  where id = v_order_id;

  return null;
end;
$$;

create trigger order_items_recalculate_total
  after insert or update or delete on public.order_items
  for each row execute function public.recalculate_order_total();

comment on table public.order_items is
  'Frozen line items of an order: product, quantity, holder_name, and the exact unit price at the moment of purchase - immune to later price changes on products. Immutable once written (no update/delete policy): "price frozen at order time" is enforced structurally, not just by convention.';
