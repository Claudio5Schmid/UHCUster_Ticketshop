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
