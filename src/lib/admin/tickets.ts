import { getSupabaseServerClient } from "@/lib/supabase-server";

export type TicketStatus = "gueltig" | "eingeloest" | "storniert" | "ersetzt";

export interface OrderTicket {
  id: string;
  token: string;
  holder_name: string | null;
  transferable: boolean;
  transferable_index: number | null;
  status: TicketStatus;
  pdf_path: string | null;
  card_sent_at: string | null;
  product_name_snapshot: string;
  /** The member list's category for a member's order (D60); null for a shop order. */
  kategorie: string | null;
}

/**
 * Every card of an order, replaced ones included - the table shows the full
 * history, so a card that was regenerated after a loss stays visible next to the
 * one that took its place.
 *
 * Ordered so those two land together: personal cards first, then the
 * transferable ones by running number, and within a number the original before
 * its replacement.
 */
export async function getOrderTickets(orderId: string): Promise<OrderTicket[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, token, holder_name, transferable, transferable_index, status, pdf_path, card_sent_at, order_items(product_name_snapshot)"
    )
    .eq("order_id", orderId)
    .order("transferable", { ascending: true })
    .order("transferable_index", { ascending: true, nullsFirst: true })
    .order("issued_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tickets: ${error.message}`);
  }

  // The card's name on screen is the same as on the card (D60): the member
  // list's category, for the one member whose order this is.
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("kategorie")
    .eq("order_id", orderId)
    .maybeSingle<{ kategorie: string | null }>();
  if (memberError) {
    throw new Error(`Failed to load member category: ${memberError.message}`);
  }
  const kategorie = member?.kategorie ?? null;

  return (data ?? []).map((row) => {
    const orderItem = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    return {
      id: row.id,
      token: row.token,
      holder_name: row.holder_name,
      transferable: row.transferable,
      transferable_index: row.transferable_index,
      status: row.status,
      pdf_path: row.pdf_path,
      card_sent_at: row.card_sent_at,
      product_name_snapshot: orderItem?.product_name_snapshot ?? "-",
      kategorie,
    };
  });
}
