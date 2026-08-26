import { createClient } from "@supabase/supabase-js";

/**
 * Public, read-only client for Server Components. Uses the publishable key, which
 * is RLS-constrained (anon can only ever see what the policies allow - active
 * products, all games). Never use this for anything that needs to write data or
 * bypass RLS; that needs the service-role key, kept strictly server-side and out of
 * this shared client (see docs/ARCHITECTURE.md #5).
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  return createClient(url, key);
}

/**
 * Service-role client - bypasses RLS entirely. Only ever import this from
 * server-only code that has no end-user session (scheduled jobs like the Swiss
 * Unihockey sync), never from anything reachable with a customer's or admin's own
 * request context. Per docs/ARCHITECTURE.md's actor-attribution note, admin-driven
 * mutations should go through the admin's own authenticated session instead, so
 * audit_log's auth.uid() attribution keeps working - this client is specifically
 * for session-less system operations.
 */
export function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  return createClient(url, key);
}
