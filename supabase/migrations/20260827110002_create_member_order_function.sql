-- Admin-triggered, always-free, always-already-paid order for a club member's
-- card(s) - distinct from create_order() (Phase 4), which is the public
-- checkout's price-resolving, Turnstile-gated path. This one is simpler on
-- purpose: an admin decided this member gets a card, there is no payment to
-- wait for, and the two possible order_items map 1:1 to the two "mitglieder-*"
-- products (personal vs. transferable), matching D24's existing pattern of one
-- order_item per holder-name/transferability combination.
create or replace function public.create_member_order(
  p_customer_name text,
  p_email text,
  p_include_personal boolean,
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

  if not p_include_personal and coalesce(p_transferable_count, 0) <= 0 then
    raise exception 'at least one of p_include_personal or p_transferable_count must apply';
  end if;

  insert into public.customers (name, email)
  values (p_customer_name, p_email)
  returning id into v_customer_id;

  v_order_number := public.next_order_number(p_season);

  insert into public.orders (order_number, status, customer_id, source, season)
  values (v_order_number, 'bezahlt', v_customer_id, 'csv_import', p_season)
  returning id into v_order_id;

  if p_include_personal then
    select * into v_personal_product from public.products where slug = 'mitglieder-uhc-uster';
    if not found then
      raise exception 'product mitglieder-uhc-uster not found';
    end if;
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_rappen, quantity, holder_name)
    values (v_order_id, v_personal_product.id, v_personal_product.name, v_personal_product.price_rappen, 1, p_customer_name);
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

revoke execute on function public.create_member_order(text, text, boolean, integer, text) from public, anon;
grant execute on function public.create_member_order(text, text, boolean, integer, text) to authenticated;
