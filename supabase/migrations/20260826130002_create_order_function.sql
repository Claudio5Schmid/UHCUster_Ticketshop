-- Order creation, server-side price resolution enforced structurally: the function
-- only ever accepts a product_id and a holder_name per line - there is no price
-- parameter to tamper with in the first place, because the client never sends one.
-- Every price is read from `products.price_rappen` at the moment of insert, exactly
-- matching the brief's "prices are resolved server-side only."
--
-- System-only, like auto_cancel_stale_orders: no grant to anon/authenticated. Only
-- callable via a service-role connection from a trusted server context (the
-- checkout Server Action), which verifies Cloudflare Turnstile before ever calling
-- this - Postgres has no good synchronous way to call out to Turnstile itself
-- (pg_net is async/fire-and-forget), so that check stays in the Next.js layer.
create or replace function public.create_order(p_customer jsonb, p_lines jsonb, p_season text)
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
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'an order needs at least one line item';
  end if;

  if coalesce(trim(p_customer->>'name'), '') = ''
    or coalesce(trim(p_customer->>'email'), '') = ''
    or coalesce(trim(p_customer->>'address_street'), '') = ''
    or coalesce(trim(p_customer->>'address_zip'), '') = ''
    or coalesce(trim(p_customer->>'address_city'), '') = ''
    or coalesce(trim(p_customer->>'phone'), '') = ''
  then
    raise exception 'customer name, address, email, and phone are all required';
  end if;

  insert into public.customers (name, address_street, address_zip, address_city, address_country, email, phone)
  values (
    p_customer->>'name',
    p_customer->>'address_street',
    p_customer->>'address_zip',
    p_customer->>'address_city',
    coalesce(nullif(p_customer->>'address_country', ''), 'CH'),
    p_customer->>'email',
    p_customer->>'phone'
  )
  returning id into v_customer_id;

  v_order_number := public.next_order_number(p_season);

  insert into public.orders (order_number, customer_id, source, season)
  values (v_order_number, v_customer_id, 'shop', p_season)
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
    'order_number', v_order_number,
    'customer_name', p_customer->>'name',
    'customer_email', p_customer->>'email',
    'total_rappen', v_total,
    'items', v_items
  );
end;
$$;

-- This project auto-grants EXECUTE to anon/authenticated on every new function
-- (see docs/DECISIONS.md and the Phase 1 harden_function_privileges migrations) -
-- revoke explicitly rather than relying on the default.
revoke execute on function public.create_order(jsonb, jsonb, text) from public, anon, authenticated;
