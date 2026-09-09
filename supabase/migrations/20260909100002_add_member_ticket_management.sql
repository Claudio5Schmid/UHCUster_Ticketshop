-- The write side of the card lifecycle: top up a member's cards after the fact,
-- and replace a lost one. Both were impossible until now.

-- 1. issue_tickets_for_order keeps its once-only guard.
--
-- That guard is the only thing standing between a double-click on "Als bezahlt
-- markieren" and a paying customer receiving two complete sets of passes, so it
-- is NOT relaxed and no bypass flag is added to it. Topping up goes through
-- add_member_tickets below instead, which cannot reach a paid order at all.
--
-- The only change here is filling the two columns migration A added. Both are
-- derived rather than read from the payload where the payload omits them, so
-- the currently deployed Node code keeps working unchanged between this
-- migration and the deploy that follows it.
create or replace function public.issue_tickets_for_order(p_order_id uuid, p_tickets jsonb)
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
  if not public.is_admin() then
    raise exception 'only admins can issue tickets';
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_status <> 'bezahlt' then
    raise exception 'order % is not marked as bezahlt (status: %)', p_order_id, v_status;
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

    -- Numbering runs across the whole order, not per line item: a customer with
    -- two transferable line items must not end up holding two "übertragbar-1".
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
    values ('ticket', (v_ticket->>'id')::uuid, 'issued', 'admin', auth.uid());
  end loop;

  return query select * from public.tickets where id = any(v_ids);
end;
$$;

revoke execute on function public.issue_tickets_for_order(uuid, jsonb) from public, anon;
grant execute on function public.issue_tickets_for_order(uuid, jsonb) to authenticated;

-- 2. add_member_tickets: cards added to an order that already has some.
--
-- Deliberately a separate function rather than a flag on the one above, and
-- fenced to the two free member-card products. An admin correcting a typo in
-- the member list structurally cannot reach a paid shop order through this,
-- whatever the caller passes in. Because those products cost 0, keeping
-- order_items.quantity in step leaves orders.total_rappen - and therefore every
-- accounting figure and the Excel export - untouched.
create or replace function public.add_member_tickets(p_order_id uuid, p_tickets jsonb)
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_customer_name text;
  v_product_id uuid;
  v_count integer;
  v_product public.products%rowtype;
  v_order_item_id uuid;
  v_ticket jsonb;
  v_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'only admins can add member tickets';
  end if;

  if p_tickets is null or jsonb_array_length(p_tickets) = 0 then
    raise exception 'no tickets given for order %', p_order_id;
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % not found', p_order_id;
  end if;
  if v_status <> 'bezahlt' then
    raise exception 'order % is not marked as bezahlt (status: %)', p_order_id, v_status;
  end if;

  select c.name into v_customer_name
    from public.customers c
    join public.orders o on o.customer_id = c.id
   where o.id = p_order_id;

  -- One order_item per product per order. Holding to that is what keeps the
  -- per-order numbering coherent and the order detail page readable, rather
  -- than growing a new line item on every top-up.
  for v_product_id, v_count in
    select (t->>'product_id')::uuid, count(*)::integer
      from jsonb_array_elements(p_tickets) t
     group by 1
  loop
    select * into v_product from public.products where id = v_product_id;
    if not found then
      raise exception 'product % not found', v_product_id;
    end if;

    if v_product.slug not in ('mitglieder-uhc-uster', 'mitglieder-uhc-uster-uebertragbar')
       or v_product.price_rappen <> 0 then
      raise exception
        'add_member_tickets only handles the free member card products, not % at % Rappen',
        v_product.slug, v_product.price_rappen;
    end if;

    select id into v_order_item_id
      from public.order_items
     where order_id = p_order_id and product_id = v_product_id
     for update;

    if found then
      update public.order_items set quantity = quantity + v_count where id = v_order_item_id;
    else
      insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
      values (p_order_id, v_product_id, v_product.name, v_product.price_rappen, v_count, v_customer_name);
    end if;
  end loop;

  for v_ticket in select * from jsonb_array_elements(p_tickets)
  loop
    select id into v_order_item_id
      from public.order_items
     where order_id = p_order_id and product_id = (v_ticket->>'product_id')::uuid;

    insert into public.tickets (
      id, order_id, order_item_id, product_id, season, holder_name,
      transferable, transferable_index, token, pdf_path
    )
    values (
      (v_ticket->>'id')::uuid,
      p_order_id,
      v_order_item_id,
      (v_ticket->>'product_id')::uuid,
      v_ticket->>'season',
      nullif(v_ticket->>'holder_name', ''),
      (v_ticket->>'transferable')::boolean,
      (v_ticket->>'transferable_index')::integer,
      v_ticket->>'token',
      v_ticket->>'pdf_path'
    );

    v_ids := array_append(v_ids, (v_ticket->>'id')::uuid);

    insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id, note)
    values ('ticket', (v_ticket->>'id')::uuid, 'issued', 'admin', auth.uid(), 'added to an order that already had tickets');
  end loop;

  -- Two admins topping up the same member at once collide on the partial unique
  -- index rather than quietly minting a second "übertragbar-3"; the loser sees
  -- the error and retries against the then-current numbering.
  return query select * from public.tickets where id = any(v_ids);
end;
$$;

revoke execute on function public.add_member_tickets(uuid, jsonb) from public, anon;
grant execute on function public.add_member_tickets(uuid, jsonb) to authenticated;

-- 3. regenerate_ticket replaces reissue_ticket.
--
-- reissue_ticket was never called by anything, and could not be: it let Postgres
-- pick the new id, but Node has to know that id before it uploads, because the
-- PDF path is derived from it and the token is an HMAC over it. It also never
-- set pdf_path, so the replacement would have had no card at all; it knew
-- nothing of the running number; and it inserted the replacement before voiding
-- the original, which the partial unique index now rejects outright.
drop function if exists public.reissue_ticket(uuid, text, text);

create or replace function public.regenerate_ticket(
  p_old_ticket_id uuid,
  p_new_ticket_id uuid,
  p_new_token text,
  p_pdf_path text,
  p_new_holder_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.tickets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can regenerate tickets';
  end if;

  select * into v_old from public.tickets where id = p_old_ticket_id for update;
  if not found then
    raise exception 'ticket % not found', p_old_ticket_id;
  end if;

  if v_old.status = 'ersetzt' then
    raise exception 'ticket % has already been replaced', p_old_ticket_id;
  end if;

  -- 'storniert' is allowed through on purpose: deactivating the lost card and
  -- then issuing its replacement is exactly the lost-card flow, and the fact
  -- that it was deactivated first survives in audit_log.

  -- Order matters. The original has to let go of its running number before the
  -- replacement can claim it, or the partial unique index rejects the insert.
  update public.tickets set status = 'ersetzt' where id = p_old_ticket_id;

  insert into public.tickets (
    id, order_id, order_item_id, product_id, season, holder_name,
    transferable, transferable_index, token, pdf_path, replaces_ticket_id
  )
  values (
    p_new_ticket_id,
    v_old.order_id,
    v_old.order_item_id,
    v_old.product_id,
    v_old.season,
    coalesce(p_new_holder_name, v_old.holder_name),
    v_old.transferable,
    -- Inherited: to everyone outside this table it is still the same card, and
    -- the number is how a member and the office refer to it.
    v_old.transferable_index,
    p_new_token,
    p_pdf_path,
    v_old.id
  );

  -- card_sent_at is deliberately NOT carried over. The member is holding a card
  -- whose QR no longer works; the replacement has to show up as still to send.

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id, note)
  values ('ticket', p_old_ticket_id, 'regenerate', 'status', v_old.status, 'ersetzt', 'admin', auth.uid(),
          'replaced by ticket ' || p_new_ticket_id::text);

  insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id, note)
  values ('ticket', p_new_ticket_id, 'regenerate', 'admin', auth.uid(),
          'replaces ticket ' || p_old_ticket_id::text);

  return p_new_ticket_id;
end;
$$;

revoke execute on function public.regenerate_ticket(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.regenerate_ticket(uuid, uuid, text, text, text) to authenticated;

-- 4. create_member_order takes a count of personal cards, not a yes/no.
--
-- The creation mask now asks how many of each kind are needed. The old boolean
-- signature is dropped rather than overloaded: two functions differing only in
-- one argument's type is an ambiguity trap for PostgREST's named-argument
-- dispatch, and there is exactly one caller.
drop function if exists public.create_member_order(text, text, boolean, integer, text);

create or replace function public.create_member_order(
  p_customer_name text,
  p_email text,
  p_personal_count integer,
  p_transferable_count integer,
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
  v_personal_product public.products%rowtype;
  v_transferable_product public.products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can create member orders';
  end if;

  if coalesce(p_personal_count, 0) <= 0 and coalesce(p_transferable_count, 0) <= 0 then
    raise exception 'a member order needs at least one card';
  end if;

  insert into public.customers (name, email)
  values (p_customer_name, p_email)
  returning id into v_customer_id;

  v_order_number := public.next_order_number(p_season);

  insert into public.orders (order_number, status, customer_id, source, season)
  values (v_order_number, 'bezahlt', v_customer_id, 'csv_import', p_season)
  returning id into v_order_id;

  if coalesce(p_personal_count, 0) > 0 then
    select * into v_personal_product from public.products where slug = 'mitglieder-uhc-uster';
    if not found then
      raise exception 'product mitglieder-uhc-uster not found';
    end if;
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
    values (v_order_id, v_personal_product.id, v_personal_product.name, v_personal_product.price_rappen, p_personal_count, p_customer_name);
  end if;

  if coalesce(p_transferable_count, 0) > 0 then
    select * into v_transferable_product from public.products where slug = 'mitglieder-uhc-uster-uebertragbar';
    if not found then
      raise exception 'product mitglieder-uhc-uster-uebertragbar not found';
    end if;
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
    values (v_order_id, v_transferable_product.id, v_transferable_product.name, v_transferable_product.price_rappen, p_transferable_count, p_customer_name);
  end if;

  insert into public.audit_log (entity_type, entity_id, action, actor_type, actor_admin_id)
  values ('order', v_order_id, 'member_order_created', 'admin', auth.uid());

  return v_order_id;
end;
$$;

revoke execute on function public.create_member_order(text, text, integer, integer, text) from public, anon;
grant execute on function public.create_member_order(text, text, integer, integer, text) to authenticated;

-- Deliberately NOT here: an update policy on the tickets Storage bucket.
--
-- Re-rendering existing PDFs so they carry the running number is a one-off
-- maintenance job (scripts/rerender-ticket-pdfs.ts), and it runs with the
-- service-role key, which bypasses Storage policies anyway. Granting every
-- logged-in admin the standing right to overwrite a ticket PDF would buy
-- nothing and widen what a stolen admin session can do.
