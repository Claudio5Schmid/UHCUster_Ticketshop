import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Session-aware Supabase client for Server Components / Server Actions in the admin
 * area. Uses the publishable key (not service-role) plus the admin's own session
 * cookie, so every read/write goes through RLS and is_admin() exactly like the
 * mutation functions expect - this is what keeps auth.uid() correctly attributing
 * admin actions in audit_log (see docs/ARCHITECTURE.md's actor-attribution note).
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies can't be set -
          // fine as long as middleware.ts is also refreshing the session.
        }
      },
    },
  });
}
