import { getSupabaseAdminClient } from "@/lib/supabase";
import { ticketsVisibleToCustomer, type OrderStatus } from "@/lib/orders/visibility";

/**
 * Shared guard for both customer download routes: a ticket PDF is handed out only
 * once the office has sent the invoice - and the cards with it (D77) - so from
 * `rechnung_versendet` on, and never for a cancelled order, whose cards no longer
 * scan anyway.
 */
export async function loadDownloadableOrderForToken(orderNumber: string): Promise<{ id: string } | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data || !ticketsVisibleToCustomer(data.status as OrderStatus)) return null;
  return { id: data.id };
}
