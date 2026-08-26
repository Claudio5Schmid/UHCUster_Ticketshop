import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client for Client Components in the admin area (e.g. the login
 * form) - shares the same cookie-based session as the server client. */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  return createBrowserClient(url, key);
}
