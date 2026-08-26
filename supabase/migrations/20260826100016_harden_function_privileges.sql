-- Postgres grants EXECUTE on newly created functions to PUBLIC by default. The
-- security advisor (get_advisors) flagged every function in the prior migrations as
-- callable by anon/authenticated as a result, regardless of the targeted grants
-- already made. Locking every function down explicitly here rather than relying on
-- that default.

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
-- Deliberately broad: no side effects, safe to expose, used by policies on other tables.

revoke execute on function public.set_updated_at() from public;
-- Trigger-only, no direct callers needed - table triggers still fire regardless of grants.

revoke execute on function public.log_price_change() from public;
-- Trigger-only.

revoke execute on function public.recalculate_order_total() from public;
-- Trigger-only.

revoke execute on function public.next_order_number(text) from public;
-- Not granted to anyone: the future checkout flow (Phase 4) will call this from a
-- trusted server-side context, which bypasses grants entirely. No legitimate reason
-- for a customer's browser to call it directly via the public API.

revoke execute on function public.transition_order_status(uuid, text) from public;
grant execute on function public.transition_order_status(uuid, text) to authenticated;

revoke execute on function public.set_refund_owed(uuid, boolean) from public;
grant execute on function public.set_refund_owed(uuid, boolean) to authenticated;

revoke execute on function public.rename_ticket_holder(uuid, text) from public;
grant execute on function public.rename_ticket_holder(uuid, text) to authenticated;

revoke execute on function public.reissue_ticket(uuid, text, text) from public;
grant execute on function public.reissue_ticket(uuid, text, text) to authenticated;

revoke execute on function public.update_product_details(uuid, text, text, jsonb, smallint, integer, boolean) from public;
grant execute on function public.update_product_details(uuid, text, text, jsonb, smallint, integer, boolean) to authenticated;

revoke execute on function public.auto_cancel_stale_orders() from public;
-- Runs only via the pg_cron schedule (create_auto_cancel_stale_orders); it has no
-- internal is_admin() check (it's not an admin action, it's a system job), so it must
-- not be reachable through the REST API at all.
