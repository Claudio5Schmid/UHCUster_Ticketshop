-- Follow-up to harden_function_privileges: revoking EXECUTE FROM PUBLIC did not
-- actually lock these down. This Supabase project has default privileges configured
-- (ALTER DEFAULT PRIVILEGES) that auto-grant EXECUTE to anon/authenticated/service_role
-- on every new function in public, independent of the PUBLIC pseudo-role grant.
-- Verified via pg_proc.proacl directly rather than trusting the advisor cache.
--
-- service_role is left untouched throughout: it requires the secret key (never
-- exposed client-side), so it isn't the exposure the security advisor is about -
-- anon/authenticated (reachable via the publishable key over the REST API) are.

-- Trigger-only functions: no direct callers should exist at all. Triggers still fire
-- regardless of the invoking role's function-level grants - only DIRECT RPC calls
-- are affected by this revoke.
revoke execute on function public.set_updated_at() from anon, authenticated;
revoke execute on function public.log_price_change() from anon, authenticated;
revoke execute on function public.recalculate_order_total() from anon, authenticated;
revoke execute on function public.prevent_price_history_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_scan_events_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_audit_log_mutation() from public, anon, authenticated;

-- System-job-only: must not be reachable via the REST API at all, since it has no
-- internal is_admin() check (it isn't an admin action).
revoke execute on function public.auto_cancel_stale_orders() from anon, authenticated;

-- Not yet wired to any caller (Phase 4 will call this from a trusted server-side
-- context that bypasses grants entirely) - no legitimate reason for a customer's
-- browser to call it directly right now.
revoke execute on function public.next_order_number(text) from anon, authenticated;

-- Admin-only mutation functions: each already self-checks is_admin() internally, but
-- anon shouldn't even be able to attempt the call - tighten to authenticated only.
revoke execute on function public.transition_order_status(uuid, text) from anon;
revoke execute on function public.set_refund_owed(uuid, boolean) from anon;
revoke execute on function public.rename_ticket_holder(uuid, text) from anon;
revoke execute on function public.reissue_ticket(uuid, text, text) from anon;
revoke execute on function public.update_product_details(uuid, text, text, jsonb, smallint, integer, boolean) from anon;

-- is_admin() is deliberately left callable by both anon and authenticated: no side
-- effects, safe to expose, and used to gate other tables' policies.
