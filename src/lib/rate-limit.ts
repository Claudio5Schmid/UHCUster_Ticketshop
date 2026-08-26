import { headers } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/supabase";

/** Vercel sets x-forwarded-for on every request; local dev and other hosts may not,
 * hence the "unknown" fallback - which just means every such request shares one
 * rate-limit bucket, an acceptable degradation outside of production. */
export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headerList.get("x-real-ip") ?? "unknown";
}

/** Returns true if this IP is still under the limit (and records this attempt),
 * false if it should be rejected. Fails open (allows the request) if the check
 * itself errors, so a database hiccup never blocks legitimate checkouts. */
export async function checkOrderRateLimit(ip: string, maxAttempts = 5, windowMinutes = 10): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("check_order_rate_limit", {
    p_ip: ip,
    p_max_attempts: maxAttempts,
    p_window_minutes: windowMinutes,
  });

  if (error) {
    return true;
  }
  return data === true;
}
