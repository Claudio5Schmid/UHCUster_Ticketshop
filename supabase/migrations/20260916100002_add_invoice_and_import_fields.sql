-- Fields for the invoice flow and the order migration (D71/O10, D76).
--
-- Contact and billing data stay on `customers`, where every export and admin
-- view already reads them; `orders` gets what belongs to one order: how it is
-- paid, which invoice it became, when the terms were accepted, and - for
-- imported rows - where it came from and whether the office has told the
-- customer about the new shop yet.

-- 1. customers: a person and, optionally, the company they order for.
--
-- `name` stays the billing name everything prints (exports, FIBU debtor, the
-- card of a transferable bundle): the company when there is one, otherwise the
-- person. The split first/last name is what the Red Castle form and the CSV
-- import actually collect; the old single-field checkout keeps writing `name`
-- only, so both new columns are nullable.
alter table public.customers
  add column first_name text,
  add column last_name text,
  add column company_name text,
  -- The customer's own reference (a PO number, say) to print on the invoice.
  add column customer_reference text;

comment on column public.customers.company_name is
  'Optional company the order is placed for (Red Castle Club). When set, it is the billing name and the name on transferable cards; otherwise the person is.';
comment on column public.customers.customer_reference is
  'Optional reference the customer wants on the invoice (PO number, cost centre). Copied to the invoice by hand in the accounting software.';

-- 2. import_batches: one row per CSV file the office imports, so a whole file
-- can be undone in one step (rollback_import_batch, next migration).
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text,
  row_count integer not null default 0,
  created_by uuid references public.admin_users (user_id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  rolled_back_by uuid references public.admin_users (user_id) on delete set null
);

alter table public.import_batches enable row level security;

create policy "Admins can view import batches"
  on public.import_batches for select
  to authenticated
  using (public.is_admin());

create policy "Admins can insert import batches"
  on public.import_batches for insert
  to authenticated
  with check (public.is_admin());

-- Same as audit_log.actor_email: the address survives the admin account.
create or replace function public.set_import_batch_creator_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null and new.created_by_email is null then
    select email into new.created_by_email from public.admin_users where user_id = new.created_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_import_batch_creator_email() from public, anon, authenticated;

create trigger import_batches_set_creator_email
  before insert on public.import_batches
  for each row execute function public.set_import_batch_creator_email();

comment on table public.import_batches is
  'One row per imported CSV file of legacy orders (Red Castle Club, season passes). orders.import_batch_id groups the orders it created; rollback_import_batch() removes them all again while none of their tickets has been scanned.';

-- 3. orders
alter table public.orders
  -- The only payment method this shop knows. A check with one value is the
  -- honest way to say so, and the place a second one would be added.
  add column payment_method text not null default 'invoice' check (payment_method in ('invoice')),
  -- The accounting system's invoice number, entered by the office when the
  -- invoice has gone out (transition to rechnung_versendet).
  add column invoice_number text,
  add column terms_accepted_at timestamptz,
  -- The legacy order number from the CSV. Unique, so a file imported twice
  -- reports "already imported" instead of creating duplicates.
  add column external_ref text,
  add column import_batch_id uuid references public.import_batches (id),
  -- Whether the office has sent this customer the "new ticket shop" message
  -- from the orders tab. Set only by that manual send (D71/O12); the automatic
  -- confirmation after a shop checkout keeps its own confirmation_email_sent_at.
  add column notification_status text not null default 'nicht_versendet'
    check (notification_status in ('nicht_versendet', 'versendet', 'fehlgeschlagen')),
  add column notified_at timestamptz,
  add column notification_error text;

create unique index orders_external_ref_key on public.orders (external_ref) where external_ref is not null;
create index orders_import_batch_id_idx on public.orders (import_batch_id) where import_batch_id is not null;
create index orders_notification_status_idx on public.orders (notification_status);

comment on column public.orders.external_ref is
  'The order number the legacy system used, from the CSV import. Unique among non-null values: the duplicate guard of the import.';
comment on column public.orders.notification_status is
  'Whether the office has e-mailed this customer from the orders tab (manual send). nicht_versendet | versendet | fehlgeschlagen; notification_error carries the provider''s reason for the last failure.';

-- Marking an order as notified goes through a function like every other write
-- to orders. Repeated sends overwrite: the office re-sending on purpose wants
-- the latest outcome, not the first.
create or replace function public.set_order_notification(p_order_id uuid, p_status text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'only admins can record order notifications';
  end if;
  if p_status not in ('versendet', 'fehlgeschlagen') then
    raise exception 'invalid notification status %', p_status;
  end if;

  select notification_status into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  update public.orders
     set notification_status = p_status,
         notified_at = case when p_status = 'versendet' then now() else notified_at end,
         notification_error = case when p_status = 'fehlgeschlagen' then p_error else null end
   where id = p_order_id;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
  values ('order', p_order_id, 'notification', 'notification_status', v_old, p_status, 'admin', auth.uid(), p_error);
end;
$$;

revoke execute on function public.set_order_notification(uuid, text, text) from public, anon;
grant execute on function public.set_order_notification(uuid, text, text) to authenticated;
