-- The invoice flow (D69, D75, D77, D78): tickets exist from the moment an order is
-- placed, the invoice follows by hand, and cancelling is a deliberate admin act
-- that also switches the order's tickets off.

-- ---------------------------------------------------------------------------
-- 1. No more automatic cancellation (D69, replaces D14).
--
-- Every shop order is now an invoice order with 30 days to pay; a job that
-- cancels after 14 - and from this migration on would void the customer's cards
-- with it - is simply wrong. The function stays, unscheduled, so the pgTAP suite
-- and the audit trail of past runs keep making sense; nothing calls it.
-- ---------------------------------------------------------------------------
select cron.unschedule('auto-cancel-stale-orders');

-- ---------------------------------------------------------------------------
-- 2. Status transitions are enforced, the invoice number is recorded with the
--    transition, and cancelling voids the order's tickets.
--
-- Allowed (D78, exactly the brief's table):
--   neu -> rechnung_versendet -> bezahlt
--   neu | rechnung_versendet -> storniert
-- A paid order cannot be cancelled any more; a wrongly imported one is removed
-- through rollback_import_batch() instead.
-- ---------------------------------------------------------------------------
drop function if exists public.transition_order_status(uuid, text);

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_invoice_number text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_invoice text;
  v_ticket record;
begin
  if not public.is_admin() then
    raise exception 'only admins can transition order status';
  end if;

  if p_new_status not in ('neu', 'rechnung_versendet', 'bezahlt', 'storniert') then
    raise exception 'invalid order status %', p_new_status;
  end if;

  select status into v_old_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  if not (
    (v_old_status = 'neu' and p_new_status in ('rechnung_versendet', 'storniert'))
    or (v_old_status = 'rechnung_versendet' and p_new_status in ('bezahlt', 'storniert'))
  ) then
    raise exception 'order status cannot change from % to %', v_old_status, p_new_status;
  end if;

  v_invoice := nullif(trim(coalesce(p_invoice_number, '')), '');
  if p_new_status = 'rechnung_versendet' and v_invoice is null then
    raise exception 'an invoice number is required to mark an order as rechnung_versendet';
  end if;

  update public.orders
     set status = p_new_status,
         invoice_number = coalesce(v_invoice, invoice_number)
   where id = p_order_id;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('order', p_order_id, 'status_change', 'status', v_old_status, p_new_status, 'admin', auth.uid());

  if v_invoice is not null then
    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
    values ('order', p_order_id, 'invoice_number_change', 'invoice_number', null, v_invoice, 'admin', auth.uid());
  end if;

  -- Cancelling switches every live card off: the scanner rejects them, the
  -- customer link shows "storniert". Each card is logged on its own, the same
  -- rows void_ticket() would write, so the ticket's history explains itself.
  if p_new_status = 'storniert' then
    for v_ticket in
      select id, status from public.tickets
       where order_id = p_order_id and status in ('gueltig', 'eingeloest')
       for update
    loop
      update public.tickets set status = 'storniert' where id = v_ticket.id;
      insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
      values ('ticket', v_ticket.id, 'voided', 'status', v_ticket.status, 'storniert', 'admin', auth.uid(), 'order cancelled');
    end loop;
  end if;
end;
$$;

revoke execute on function public.transition_order_status(uuid, text, text) from public, anon;
grant execute on function public.transition_order_status(uuid, text, text) to authenticated;

-- Correcting a typo in the invoice number after the fact, without a status change.
create or replace function public.set_invoice_number(p_order_id uuid, p_invoice_number text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_new text;
begin
  if not public.is_admin() then
    raise exception 'only admins can set invoice numbers';
  end if;

  v_new := nullif(trim(coalesce(p_invoice_number, '')), '');

  select invoice_number into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  update public.orders set invoice_number = v_new where id = p_order_id;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('order', p_order_id, 'invoice_number_change', 'invoice_number', v_old, v_new, 'admin', auth.uid());
end;
$$;

revoke execute on function public.set_invoice_number(uuid, text) from public, anon;
grant execute on function public.set_invoice_number(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Ticket issuance no longer waits for payment.
--
-- One internal body, two doors: issue_tickets_for_order for an admin session
-- (the import, and the fallback on the order page), issue_tickets_system for
-- the checkout, which has no session and runs service-role - the same
-- arrangement create_order() has always had. The once-only guard stays exactly
-- as it was; the only relaxed rule is the status: anything but storniert.
-- ---------------------------------------------------------------------------
create or replace function public.issue_tickets_internal(
  p_order_id uuid,
  p_tickets jsonb,
  p_actor_type text,
  p_actor_admin_id uuid
)
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_ticket jsonb;
  v_ids uuid[] := '{}';
  v_next_index integer := 0;
  v_index integer;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_status = 'storniert' then
    raise exception 'order % is storniert and cannot receive tickets', p_order_id;
  end if;

  if exists (
    select 1 from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    where oi.order_id = p_order_id
  ) then
    raise exception 'tickets have already been issued for order %', p_order_id;
  end if;

  for v_ticket in select * from jsonb_array_elements(p_tickets)
  loop
    if not exists (
      select 1 from public.order_items where id = (v_ticket->>'order_item_id')::uuid and order_id = p_order_id
    ) then
      raise exception 'order_item % does not belong to order %', v_ticket->>'order_item_id', p_order_id;
    end if;

    -- Numbering runs across the whole order, not per line item.
    if (v_ticket->>'transferable')::boolean then
      v_next_index := v_next_index + 1;
      v_index := coalesce((v_ticket->>'transferable_index')::integer, v_next_index);
    else
      v_index := null;
    end if;

    insert into public.tickets (
      id, order_id, order_item_id, product_id, season, holder_name,
      transferable, transferable_index, token, pdf_path
    )
    values (
      (v_ticket->>'id')::uuid,
      p_order_id,
      (v_ticket->>'order_item_id')::uuid,
      (v_ticket->>'product_id')::uuid,
      v_ticket->>'season',
      nullif(v_ticket->>'holder_name', ''),
      (v_ticket->>'transferable')::boolean,
      v_index,
      v_ticket->>'token',
      v_ticket->>'pdf_path'
    );

    v_ids := array_append(v_ids, (v_ticket->>'id')::uuid);

    insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id)
    values ('ticket', (v_ticket->>'id')::uuid, 'issued', p_actor_type, p_actor_admin_id);
  end loop;

  return query select * from public.tickets where id = any(v_ids);
end;
$$;

-- Nobody calls the body directly - only the two wrappers below.
revoke execute on function public.issue_tickets_internal(uuid, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public.issue_tickets_for_order(p_order_id uuid, p_tickets jsonb)
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can issue tickets';
  end if;
  return query select * from public.issue_tickets_internal(p_order_id, p_tickets, 'admin', auth.uid());
end;
$$;

revoke execute on function public.issue_tickets_for_order(uuid, jsonb) from public, anon;
grant execute on function public.issue_tickets_for_order(uuid, jsonb) to authenticated;

-- The checkout's door. System-only like create_order(): no grant to anon or
-- authenticated, callable only through the service-role connection of the
-- checkout Server Action, right after create_order() has committed.
create or replace function public.issue_tickets_system(p_order_id uuid, p_tickets jsonb)
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query select * from public.issue_tickets_internal(p_order_id, p_tickets, 'system', null);
end;
$$;

revoke execute on function public.issue_tickets_system(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_order() learns the company form.
--
-- Same shape as before - product id and holder name per line, every price
-- resolved here - plus: a person's first and last name, an optional company,
-- an optional reference, phone no longer required, and the payment terms the
-- customer has to accept (D65: 30 days net) recorded as a timestamp. The single
-- `name` key is still accepted for the season-pass checkout until it moves to
-- the split fields.
-- ---------------------------------------------------------------------------
drop function if exists public.create_order(jsonb, jsonb, text);

create or replace function public.create_order(
  p_customer jsonb,
  p_lines jsonb,
  p_season text,
  p_terms_accepted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_line jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_items jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_line_total integer;
  v_first text := nullif(trim(coalesce(p_customer->>'first_name', '')), '');
  v_last text := nullif(trim(coalesce(p_customer->>'last_name', '')), '');
  v_company text := nullif(trim(coalesce(p_customer->>'company_name', '')), '');
  v_person text;
  v_name text;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'an order needs at least one line item';
  end if;

  if not coalesce(p_terms_accepted, false) then
    raise exception 'the payment terms must be accepted';
  end if;

  v_person := nullif(trim(concat_ws(' ', v_first, v_last)), '');
  -- The billing name: the company when there is one, otherwise the person.
  v_name := coalesce(v_company, v_person, nullif(trim(coalesce(p_customer->>'name', '')), ''));

  if v_name is null
    or coalesce(trim(p_customer->>'email'), '') = ''
    or coalesce(trim(p_customer->>'address_street'), '') = ''
    or coalesce(trim(p_customer->>'address_zip'), '') = ''
    or coalesce(trim(p_customer->>'address_city'), '') = ''
  then
    raise exception 'customer name, address and email are all required';
  end if;

  insert into public.customers (
    name, first_name, last_name, company_name, customer_reference,
    address_street, address_zip, address_city, address_country, email, phone
  )
  values (
    v_name,
    v_first,
    v_last,
    v_company,
    nullif(trim(coalesce(p_customer->>'customer_reference', '')), ''),
    trim(p_customer->>'address_street'),
    trim(p_customer->>'address_zip'),
    trim(p_customer->>'address_city'),
    coalesce(nullif(p_customer->>'address_country', ''), 'CH'),
    trim(p_customer->>'email'),
    nullif(trim(coalesce(p_customer->>'phone', '')), '')
  )
  returning id into v_customer_id;

  v_order_number := public.next_order_number(p_season);

  insert into public.orders (order_number, customer_id, source, season, payment_method, terms_accepted_at)
  values (v_order_number, v_customer_id, 'shop', p_season, 'invoice', now())
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_product
    from public.products
    where id = (v_line->>'product_id')::uuid
    for update;

    if not found or not v_product.active then
      raise exception 'product % is not available', coalesce(v_line->>'product_id', 'unknown');
    end if;

    -- The only place a line's ticket count comes from - never client-supplied.
    v_quantity := coalesce((v_product.benefits->>'included_passes')::integer, 1);
    v_line_total := v_product.price_rappen * v_quantity;

    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
    values (v_order_id, v_product.id, v_product.name, v_product.price_rappen, v_quantity, nullif(trim(v_line->>'holder_name'), ''));

    v_total := v_total + v_line_total;
    v_items := v_items || jsonb_build_object(
      'product_name', v_product.name,
      'quantity', v_quantity,
      'unit_price_rappen', v_product.price_rappen,
      'line_total_rappen', v_line_total,
      'holder_name', nullif(trim(v_line->>'holder_name'), '')
    );
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_name', v_name,
    'customer_email', trim(p_customer->>'email'),
    'total_rappen', v_total,
    'items', v_items
  );
end;
$$;

revoke execute on function public.create_order(jsonb, jsonb, text, boolean) from public, anon, authenticated;
