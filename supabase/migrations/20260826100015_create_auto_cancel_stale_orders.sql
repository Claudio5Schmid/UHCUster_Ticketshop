-- D14: an order left in status 'neu' for 14+ days is automatically cancelled.
-- Actor is recorded as "system", distinct from admin-triggered transitions.
create or replace function public.auto_cancel_stale_orders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  for v_order in
    select id, status from public.orders
    where status = 'neu' and created_at < now() - interval '14 days'
  loop
    update public.orders set status = 'storniert' where id = v_order.id;

    insert into public.audit_log (entity_type, entity_id, action, field_name, old_value, new_value, actor_type, actor_admin_id)
    values ('order', v_order.id, 'status_change', 'status', v_order.status, 'storniert', 'system', null);
  end loop;
end;
$$;

-- Scheduled daily at 02:00 UTC via pg_cron (enabled in enable_extensions).
select cron.schedule(
  'auto-cancel-stale-orders',
  '0 2 * * *',
  $$select public.auto_cancel_stale_orders();$$
);
