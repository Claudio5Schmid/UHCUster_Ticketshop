import { getSupabaseAdminClient } from "@/lib/supabase";
import type { OrderStatus } from "@/lib/admin/orders";

/**
 * The customer-facing read of an order, for /meine-tickets (docs/DECISIONS.md D54).
 *
 * Service-role client on purpose: there is no session here - the caller has already
 * verified a signed link (or an order-number + e-mail pair), which is what
 * authorises this read, exactly like create_order() and the scanner routes verify
 * their own caller and then act service-role. RLS gives `anon` nothing on `orders`,
 * so a public client could not serve this page at all.
 *
 * What it deliberately does NOT return: address, phone, e-mail. A link that leaks
 * should expose a season pass, not a customer record. The name stays because it is
 * printed on the pass itself.
 */

export interface CustomerOrderItem {
  id: string;
  productName: string;
  quantity: number;
  holderName: string | null;
  lineTotalRappen: number;
}

export interface CustomerOrderTicket {
  id: string;
  productName: string;
  holderName: string | null;
}

export interface CustomerOrderView {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  totalRappen: number;
  customerName: string;
  items: CustomerOrderItem[];
  tickets: CustomerOrderTicket[];
}

export async function getCustomerOrderView(orderNumber: string): Promise<CustomerOrderView | null> {
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, status, total_rappen, created_at, customers(name)")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name_snapshot, quantity, holder_name, line_total_rappen")
    .eq("order_id", order.id);

  const status = order.status as OrderStatus;
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;

  return {
    orderNumber: order.order_number,
    status,
    createdAt: order.created_at,
    totalRappen: order.total_rappen,
    customerName: customer?.name ?? "",
    items: (items ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name_snapshot,
      quantity: item.quantity,
      holderName: item.holder_name,
      lineTotalRappen: item.line_total_rappen,
    })),
    // Tickets only exist once the office marks the order paid, and only the ones
    // still standing are offered: a voided or replaced pass would open a PDF that
    // no longer scans at the door.
    tickets: status === "bezahlt" ? await getDownloadableTickets(order.id) : [],
  };
}

async function getDownloadableTickets(orderId: string): Promise<CustomerOrderTicket[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, holder_name, status, pdf_path, order_items!inner(order_id, product_name_snapshot)")
    .eq("order_items.order_id", orderId)
    .in("status", ["gueltig", "eingeloest"])
    .order("issued_at", { ascending: true });

  if (error) return [];

  return (data ?? [])
    .filter((row) => Boolean(row.pdf_path))
    .map((row) => {
      const orderItem = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
      return {
        id: row.id,
        productName: orderItem?.product_name_snapshot ?? "Ticket",
        holderName: row.holder_name,
      };
    });
}

/**
 * The fallback path for a customer who lost the link: order number plus the e-mail
 * the order was placed with. Both must match the same order, and the comparison
 * happens here in JS rather than as a PostgREST `ilike` filter - `%` and `_` in a
 * user-supplied string are wildcards there, which would turn "any e-mail" into a
 * valid answer.
 */
export async function findOrderByNumberAndEmail(orderNumber: string, email: string): Promise<string | null> {
  const supabase = getSupabaseAdminClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("order_number, customers(email)")
    .eq("order_number", orderNumber.trim().toUpperCase())
    .maybeSingle();

  if (error || !order) return null;

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  const stored = customer?.email?.trim().toLowerCase();
  if (!stored || stored !== email.trim().toLowerCase()) return null;

  return order.order_number;
}
