import { getSupabaseAdminClient } from "@/lib/supabase";

/**
 * Shared guard for both customer download routes: a ticket PDF is only ever handed
 * out for an order the office has actually marked `bezahlt`. Tickets do not exist
 * before that point anyway - this makes the rule explicit rather than relying on
 * that ordering staying true.
 */
export async function loadPaidOrderForToken(orderNumber: string): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data || data.status !== "bezahlt") return null;
  return { id: data.id };
}
