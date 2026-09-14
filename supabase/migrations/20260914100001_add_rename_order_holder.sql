-- A corrected member name has to reach the records the order is actually made of.
--
-- members.vorname/nachname was never the only place a name lived: the customer
-- row and every order item hold their own copy, written when the order was
-- created, and nothing refreshed them when a later import corrected the member.
-- That is how one import's encoding fault survived in 172 customer records and
-- 172 order items long after the member rows themselves had been put right - and
-- those are the records the cards and the invoice are addressed from.
--
-- A function rather than a policy: order_items carries prices and quantities and
-- deliberately has no UPDATE policy at all, so an admin update from the
-- application would silently touch zero rows. Opening a blanket policy to fix a
-- name would also let an admin edit a price straight past price_history. This
-- narrows the grant to exactly the one field that needs it.
create or replace function public.rename_order_holder(p_order_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_old_name text;
begin
  if not public.is_admin() then
    raise exception 'only admins can rename an order holder';
  end if;

  if coalesce(btrim(p_full_name), '') = '' then
    raise exception 'a holder name cannot be empty';
  end if;

  select o.customer_id, c.name
    into v_customer_id, v_old_name
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.id = p_order_id
  for update of c;

  if not found then
    raise exception 'order % not found', p_order_id;
  end if;

  -- Nothing to do is the common case on a re-import: every row already agrees.
  if v_old_name is not distinct from p_full_name then
    return;
  end if;

  update public.customers set name = p_full_name where id = v_customer_id;

  -- Every item of a member order is held by the member - confirmed against the
  -- live data, where all 527 of them carry exactly the customer's name and none
  -- carries a different one.
  update public.order_items
  set holder_name = p_full_name
  where order_id = p_order_id
    and holder_name is distinct from p_full_name;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('order', p_order_id, 'holder_name_change', 'name', v_old_name, p_full_name, 'admin', auth.uid());
end;
$$;

-- Revoking from PUBLIC is not enough here: this project has ALTER DEFAULT
-- PRIVILEGES auto-granting EXECUTE to anon on every new function in public,
-- independently of the PUBLIC pseudo-role (see harden_function_privileges_v2).
-- Without the second revoke, anon reaches the function and is only turned away
-- by the is_admin() check inside it.
revoke execute on function public.rename_order_holder(uuid, text) from public, anon;
grant execute on function public.rename_order_holder(uuid, text) to authenticated;

comment on function public.rename_order_holder is
  'Carries a corrected holder name to the customer and the order items of one order. Used by the member import, so a name fixed in the CSV reaches the records the cards and the invoice are addressed from, not just the member row.';
