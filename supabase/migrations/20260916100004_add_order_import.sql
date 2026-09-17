-- The order migration (brief §3): one function that writes an imported order the
-- way create_order() writes a shop order, and one that takes a whole batch back.
--
-- Both run in the admin's own session (is_admin(), auth.uid() in the audit
-- trail), like create_member_order(). The import never sends mail - not because
-- these functions refuse to, but because nothing in this path can: mail lives in
-- Node, behind a check on orders.source that the Phase 3 tests pin down.

-- ---------------------------------------------------------------------------
-- 1. create_import_order
--
-- Deliberately narrower than create_order(): one product, a quantity taken from
-- the file (a legacy Gold order may well hold four cards, D74), the status and
-- invoice number as they were, and the original order date as created_at so
-- the FIBU export dates the sale when it happened. The product may be inactive -
-- "Spezial" exists only for this.
-- ---------------------------------------------------------------------------
create or replace function public.create_import_order(
  p_customer jsonb,
  p_product_id uuid,
  p_quantity integer,
  p_holder_name text,
  p_status text,
  p_invoice_number text,
  p_external_ref text,
  p_batch_id uuid,
  p_ordered_at timestamptz,
  p_season text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_product public.products%rowtype;
  v_first text := nullif(trim(coalesce(p_customer->>'first_name', '')), '');
  v_last text := nullif(trim(coalesce(p_customer->>'last_name', '')), '');
  v_company text := nullif(trim(coalesce(p_customer->>'company_name', '')), '');
  v_email text := nullif(trim(coalesce(p_customer->>'email', '')), '');
  v_name text;
  v_ref text := nullif(trim(coalesce(p_external_ref, '')), '');
begin
  if not public.is_admin() then
    raise exception 'only admins can import orders';
  end if;

  if p_status not in ('neu', 'rechnung_versendet', 'bezahlt', 'storniert') then
    raise exception 'invalid order status %', p_status;
  end if;
  if coalesce(p_quantity, 0) < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  if v_email is null then
    raise exception 'an e-mail address is required';
  end if;

  v_name := coalesce(v_company, nullif(trim(concat_ws(' ', v_first, v_last)), ''));
  if v_name is null then
    raise exception 'a company or a person name is required';
  end if;

  if v_ref is not null and exists (select 1 from public.orders where external_ref = v_ref) then
    raise exception 'external_ref % has already been imported', v_ref;
  end if;

  if p_batch_id is not null and not exists (
    select 1 from public.import_batches where id = p_batch_id and rolled_back_at is null
  ) then
    raise exception 'import batch % does not exist or was rolled back', p_batch_id;
  end if;

  select * into v_product from public.products where id = p_product_id;
  if not found then
    raise exception 'product % not found', p_product_id;
  end if;

  insert into public.customers (name, first_name, last_name, company_name, email)
  values (v_name, v_first, v_last, v_company, v_email)
  returning id into v_customer_id;

  v_order_number := public.next_order_number(p_season);

  insert into public.orders (
    order_number, status, customer_id, source, season, payment_method,
    invoice_number, external_ref, import_batch_id, created_at
  )
  values (
    v_order_number, p_status, v_customer_id, 'csv_import', p_season, 'invoice',
    nullif(trim(coalesce(p_invoice_number, '')), ''), v_ref, p_batch_id, coalesce(p_ordered_at, now())
  )
  returning id into v_order_id;

  -- The product's price as it stands today, frozen into the line like every
  -- other order - the legacy system's amount is not in the file.
  insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
  values (v_order_id, v_product.id, v_product.name, v_product.price_rappen, p_quantity, nullif(trim(coalesce(p_holder_name, '')), ''));

  insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id, note)
  values ('order', v_order_id, 'import_order_created', 'admin', auth.uid(),
          concat_ws(' ', 'external_ref', v_ref, 'batch', p_batch_id::text));

  return v_order_id;
end;
$$;

revoke execute on function public.create_import_order(jsonb, uuid, integer, text, text, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.create_import_order(jsonb, uuid, integer, text, text, text, text, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. rollback_import_batch
--
-- Hard-deletes everything one batch created (D71/O17): tickets, line items,
-- orders, and the customers that exist only because of them. Refused the moment
-- any ticket of the batch has been scanned - scan_events is the door's log and
-- references tickets with ON DELETE RESTRICT on purpose; from then on the way is
-- cancelling single orders. Returns the storage paths of the deleted cards so
-- the caller can remove the PDFs, which this function cannot reach.
-- ---------------------------------------------------------------------------
create or replace function public.rollback_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_ids uuid[];
  v_customer_ids uuid[];
  v_pdf_paths text[];
  v_tickets integer;
  v_orders integer;
  v_customers integer;
  v_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can roll back an import';
  end if;

  perform 1 from public.import_batches where id = p_batch_id and rolled_back_at is null for update;
  if not found then
    raise exception 'import batch % does not exist or was already rolled back', p_batch_id;
  end if;

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(customer_id), '{}')
    into v_order_ids, v_customer_ids
    from public.orders where import_batch_id = p_batch_id;

  if exists (
    select 1 from public.scan_events s
    join public.tickets t on t.id = s.ticket_id
    where t.order_id = any(v_order_ids)
  ) then
    raise exception 'batch % has tickets that were already scanned and cannot be rolled back', p_batch_id;
  end if;

  select coalesce(array_agg(pdf_path), '{}') into v_pdf_paths
    from public.tickets where order_id = any(v_order_ids) and pdf_path is not null;

  foreach v_order_id in array v_order_ids
  loop
    insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id, note)
    values ('order', v_order_id, 'import_rolled_back', 'admin', auth.uid(), 'batch ' || p_batch_id::text);
  end loop;

  with deleted as (delete from public.tickets where order_id = any(v_order_ids) returning id)
  select count(*) into v_tickets from deleted;

  delete from public.order_items where order_id = any(v_order_ids);

  with deleted as (delete from public.orders where id = any(v_order_ids) returning id)
  select count(*) into v_orders from deleted;

  -- Only customers no other order still points at: the import creates one per
  -- row, so this is normally all of them, but a shared customer is never taken
  -- away from a shop order.
  with deleted as (
    delete from public.customers c
     where c.id = any(v_customer_ids)
       and not exists (select 1 from public.orders o where o.customer_id = c.id)
    returning id
  )
  select count(*) into v_customers from deleted;

  update public.import_batches
     set rolled_back_at = now(), rolled_back_by = auth.uid()
   where id = p_batch_id;

  return jsonb_build_object(
    'orders', v_orders,
    'tickets', v_tickets,
    'customers', v_customers,
    'pdf_paths', to_jsonb(v_pdf_paths)
  );
end;
$$;

revoke execute on function public.rollback_import_batch(uuid) from public, anon;
grant execute on function public.rollback_import_batch(uuid) to authenticated;

-- The PDFs of a rolled-back batch have to go too. Scoped like the read, upload
-- and replace policies: admins, tickets bucket only.
create policy "Admins can delete ticket files"
  on storage.objects for delete
  using (bucket_id = 'tickets' and public.is_admin());
