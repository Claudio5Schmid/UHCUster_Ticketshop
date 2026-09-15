-- The card prints from tickets.holder_name, and that is the one copy of the name
-- rename_order_holder never touched. So a corrected member reached the member row,
-- the customer and the order items, and stopped one step short of the thing the
-- member actually holds: 27 cards still read "SchŸtz" and "JŸrg" while every screen
-- in the admin showed them correctly.
--
-- Worse, the early return made it permanent. It compared the new name against the
-- *customer* name and gave up when they matched - so once the customer row had been
-- repaired, every later import returned before reaching anything else, and no amount
-- of re-importing could ever have fixed the tickets. The guard now sits on each
-- update instead, where "nothing to do" is decided per table rather than for all of
-- them by one of them.

create or replace function public.rename_order_holder(p_order_id uuid, p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_old_name text;
  v_changed boolean := false;
  v_rows integer;
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

  update public.customers
  set name = p_full_name
  where id = v_customer_id and name is distinct from p_full_name;
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;

  -- Every item of a member order is held by the member - confirmed against the
  -- live data, where all of them carry exactly the customer's name.
  update public.order_items
  set holder_name = p_full_name
  where order_id = p_order_id
    and holder_name is distinct from p_full_name;
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;

  -- The card itself. Voided and replaced cards are left alone: they are history,
  -- and a name change is not a reason to rewrite what a past card said.
  update public.tickets
  set holder_name = p_full_name
  where order_id = p_order_id
    and status in ('gueltig', 'eingeloest')
    and holder_name is distinct from p_full_name;
  get diagnostics v_rows = row_count;
  v_changed := v_changed or v_rows > 0;

  if not v_changed then
    return;
  end if;

  insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
  values ('order', p_order_id, 'holder_name_change', 'name', v_old_name, p_full_name, 'admin', auth.uid());
end;
$$;

revoke execute on function public.rename_order_holder(uuid, text) from public, anon, authenticated;
grant execute on function public.rename_order_holder(uuid, text) to authenticated;

-- One-off repair of the cards that were already issued with a mangled name. The
-- correct spelling is sitting right next to each of them on the order item, which
-- was repaired earlier and matches the customer row exactly - so this is a copy,
-- not a guess. Voided cards keep what they said.
update public.tickets t
set holder_name = oi.holder_name
from public.order_items oi
where oi.id = t.order_item_id
  and t.status in ('gueltig', 'eingeloest')
  and oi.holder_name is not null
  and t.holder_name is distinct from oi.holder_name;
