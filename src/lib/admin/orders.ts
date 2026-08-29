import { getSupabaseServerClient } from "@/lib/supabase-server";

export type OrderStatus = "neu" | "rechnung_versendet" | "bezahlt" | "storniert";

export interface OrderListItem {
  id: string;
  order_number: string;
  status: OrderStatus;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  customer_name: string;
}

export interface OrderFilters {
  status?: OrderStatus | "alle";
  search?: string;
}

/** The count that drives the page-title/tab badge - office checks this once or
 * twice a day, so it needs to be impossible to miss. */
export async function getNewOrderCount(): Promise<number> {
  const supabase = await getSupabaseServerClient();
  const { count } = await supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "neu");
  return count ?? 0;
}

export interface OrderStatusCounts {
  neu: number;
  rechnung_versendet: number;
  bezahlt: number;
  storniert: number;
  alle: number;
  offener_betrag_rappen: number;
}

/** Drives the summary tiles above the orders list, so the office can see the shape of
 * the pipeline (and how much money is still outstanding) without reading every row. */
export async function getOrderStatusCounts(): Promise<OrderStatusCounts> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("orders").select("status, total_rappen");
  if (error) throw new Error(`Failed to load order counts: ${error.message}`);

  const counts: OrderStatusCounts = {
    neu: 0,
    rechnung_versendet: 0,
    bezahlt: 0,
    storniert: 0,
    alle: 0,
    offener_betrag_rappen: 0,
  };

  for (const row of data ?? []) {
    const status = row.status as OrderStatus;
    if (status in counts) counts[status] += 1;
    counts.alle += 1;
    // Outstanding = invoiced or awaiting invoice, but not yet paid and not cancelled.
    if (status === "neu" || status === "rechnung_versendet") {
      counts.offener_betrag_rappen += row.total_rappen ?? 0;
    }
  }

  return counts;
}

const ORDER_COLUMNS = "id, order_number, status, refund_owed, total_rappen, created_at, customers(name)";

export async function getOrders(filters: OrderFilters): Promise<OrderListItem[]> {
  const supabase = await getSupabaseServerClient();
  const term = filters.search?.trim();

  if (!term) {
    let query = supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
    if (filters.status && filters.status !== "alle") {
      query = query.eq("status", filters.status);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Failed to load orders: ${error.message}`);
    return (data ?? []).map(toOrderListItem);
  }

  // Search matches either the order number or the customer's name - PostgREST
  // can't OR a filter across a joined table in one query, so run both and merge.
  let byNumberQuery = supabase.from("orders").select(ORDER_COLUMNS).ilike("order_number", `%${term}%`);
  let byNameQuery = supabase.from("orders").select("id, order_number, status, refund_owed, total_rappen, created_at, customers!inner(name)").ilike("customers.name", `%${term}%`);

  if (filters.status && filters.status !== "alle") {
    byNumberQuery = byNumberQuery.eq("status", filters.status);
    byNameQuery = byNameQuery.eq("status", filters.status);
  }

  const [byNumber, byName] = await Promise.all([byNumberQuery, byNameQuery]);
  if (byNumber.error) throw new Error(`Failed to load orders: ${byNumber.error.message}`);
  if (byName.error) throw new Error(`Failed to load orders: ${byName.error.message}`);

  const merged = new Map<string, ReturnType<typeof toOrderListItem>>();
  for (const row of byNumber.data ?? []) merged.set(row.id, toOrderListItem(row));
  for (const row of byName.data ?? []) merged.set(row.id, toOrderListItem(row));

  return [...merged.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

function toOrderListItem(row: {
  id: string;
  order_number: string;
  status: string;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
}): OrderListItem {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status as OrderStatus,
    refund_owed: row.refund_owed,
    total_rappen: row.total_rappen,
    created_at: row.created_at,
    customer_name: customer?.name ?? "-",
  };
}

export interface OrderDetail {
  id: string;
  order_number: string;
  status: OrderStatus;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  files_handed_over_at: string | null;
  confirmation_email_sent_at: string | null;
  customer: {
    name: string;
    email: string;
    phone: string;
    address_street: string;
    address_zip: string;
    address_city: string;
  };
  items: Array<{
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price_rappen: number;
    line_total_rappen: number;
    holder_name: string | null;
  }>;
}

export async function getOrderDetail(orderNumber: string): Promise<OrderDetail | null> {
  const supabase = await getSupabaseServerClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, refund_owed, total_rappen, created_at, files_handed_over_at, confirmation_email_sent_at, customers(name, email, phone, address_street, address_zip, address_city)"
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name_snapshot, quantity, unit_price_rappen, line_total_rappen, holder_name")
    .eq("order_id", order.id);

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;

  return {
    id: order.id,
    order_number: order.order_number,
    status: order.status as OrderStatus,
    refund_owed: order.refund_owed,
    total_rappen: order.total_rappen,
    created_at: order.created_at,
    files_handed_over_at: order.files_handed_over_at,
    confirmation_email_sent_at: order.confirmation_email_sent_at,
    customer: {
      name: customer?.name ?? "-",
      email: customer?.email ?? "-",
      phone: customer?.phone ?? "-",
      address_street: customer?.address_street ?? "-",
      address_zip: customer?.address_zip ?? "-",
      address_city: customer?.address_city ?? "-",
    },
    items: items ?? [],
  };
}
