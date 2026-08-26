import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface OrderTicket {
  id: string;
  token: string;
  holder_name: string | null;
  transferable: boolean;
  status: "gueltig" | "eingeloest" | "storniert" | "ersetzt";
  pdf_path: string | null;
  product_name_snapshot: string;
}

export async function getOrderTickets(orderId: string): Promise<OrderTicket[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, token, holder_name, transferable, status, pdf_path, order_items!inner(order_id, product_name_snapshot)")
    .eq("order_items.order_id", orderId)
    .order("issued_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load tickets: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const orderItem = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
    return {
      id: row.id,
      token: row.token,
      holder_name: row.holder_name,
      transferable: row.transferable,
      status: row.status,
      pdf_path: row.pdf_path,
      product_name_snapshot: orderItem?.product_name_snapshot ?? "-",
    };
  });
}
