import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ProductCategory } from "@/lib/products";
import type { OrderStatus } from "@/lib/orders/visibility";

export type { OrderStatus } from "@/lib/orders/visibility";

export type OrderSource = "shop" | "csv_import";
export type NotificationStatus = "nicht_versendet" | "versendet" | "fehlgeschlagen";

export interface OrderListItem {
  id: string;
  order_number: string;
  status: OrderStatus;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  customer_name: string;
  customer_email: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  customer_reference: string | null;
  source: OrderSource;
  external_ref: string | null;
  invoice_number: string | null;
  notification_status: NotificationStatus;
  notified_at: string | null;
  /** Of the first line item - a Red Castle or imported order has exactly one. */
  category: ProductCategory | null;
  variant: string | null;
  /** The catalog's word for the variant ("Gold"), for screens and exports. */
  variant_label: string | null;
  product_name: string;
  /** Cards on the order, across all line items. */
  quantity: number;
  /** Cards that still stand (gueltig/eingeloest) - what a send would attach. */
  live_tickets: number;
}

export interface OrderFilters {
  status?: OrderStatus | "alle";
  search?: string;
  source?: OrderSource | "alle";
  category?: ProductCategory | "alle";
  variant?: string | "alle";
  /** "offen" = not yet told about the new shop (notification_status nicht_versendet). */
  notified?: "offen" | "alle";
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

const ORDER_COLUMNS =
  "id, order_number, status, refund_owed, total_rappen, created_at, source, external_ref, invoice_number, notification_status, notified_at, customers(name, email, company_name, first_name, last_name, phone, address_street, address_zip, address_city, customer_reference), order_items(product_name_snapshot, quantity, products(category, variant)), tickets(status)";

interface CustomerRow {
  name: string;
  email: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_street: string | null;
  address_zip: string | null;
  address_city: string | null;
  customer_reference: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  refund_owed: boolean;
  total_rappen: number;
  created_at: string;
  source: string;
  external_ref: string | null;
  invoice_number: string | null;
  notification_status: string;
  notified_at: string | null;
  customers: CustomerRow | CustomerRow[] | null;
  order_items:
    | Array<{
        product_name_snapshot: string;
        quantity: number;
        products: { category: string | null; variant: string | null } | { category: string | null; variant: string | null }[] | null;
      }>
    | null;
  tickets: Array<{ status: string }> | null;
}

/**
 * The list behind the Bestellungen tab. Filters that PostgREST can apply are
 * applied there; category and variant live on the joined product and are
 * filtered here, in one pass, after the rows come back - the whole table is a
 * few hundred rows, and "any line item matches" (D71/O21) is easier to say in
 * code than in a nested filter.
 */
export async function getOrders(filters: OrderFilters): Promise<OrderListItem[]> {
  const supabase = await getSupabaseServerClient();

  let query = supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
  if (filters.status && filters.status !== "alle") query = query.eq("status", filters.status);
  if (filters.source && filters.source !== "alle") query = query.eq("source", filters.source);
  if (filters.notified === "offen") query = query.eq("notification_status", "nicht_versendet");

  const [{ data, error }, variants] = await Promise.all([query.returns<OrderRow[]>(), getVariantOptions()]);
  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  const variantLabels = new Map(variants.map((entry) => [`${entry.category}/${entry.variant}`, entry.label]));

  const term = filters.search?.trim().toLowerCase();
  const category = filters.category && filters.category !== "alle" ? filters.category : null;
  const variant = filters.variant && filters.variant !== "alle" ? filters.variant : null;

  return (data ?? [])
    .filter((row) => {
      if (category || variant) {
        const items = row.order_items ?? [];
        const matches = items.some((item) => {
          const product = Array.isArray(item.products) ? item.products[0] : item.products;
          if (category && product?.category !== category) return false;
          if (variant && product?.variant !== variant) return false;
          return true;
        });
        if (!matches) return false;
      }
      if (term) {
        const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
        const haystack = [row.order_number, row.external_ref, customer?.name, customer?.email, customer?.company_name, row.invoice_number]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    })
    .map((row) => toOrderListItem(row, variantLabels));
}

function toOrderListItem(row: OrderRow, variantLabels: Map<string, string>): OrderListItem {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const items = row.order_items ?? [];
  const first = items[0];
  const product = first ? (Array.isArray(first.products) ? first.products[0] : first.products) : null;

  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status as OrderStatus,
    refund_owed: row.refund_owed,
    total_rappen: row.total_rappen,
    created_at: row.created_at,
    customer_name: customer?.name ?? "-",
    customer_email: customer?.email ?? "",
    company_name: customer?.company_name ?? null,
    first_name: customer?.first_name ?? null,
    last_name: customer?.last_name ?? null,
    phone: customer?.phone ?? null,
    address_street: customer?.address_street ?? null,
    address_zip: customer?.address_zip ?? null,
    address_city: customer?.address_city ?? null,
    customer_reference: customer?.customer_reference ?? null,
    source: row.source as OrderSource,
    external_ref: row.external_ref,
    invoice_number: row.invoice_number,
    notification_status: row.notification_status as NotificationStatus,
    notified_at: row.notified_at,
    category: (product?.category as ProductCategory | null) ?? null,
    variant: product?.variant ?? null,
    variant_label: product?.category && product.variant ? (variantLabels.get(`${product.category}/${product.variant}`) ?? null) : null,
    product_name: first?.product_name_snapshot ?? "-",
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    live_tickets: (row.tickets ?? []).filter((ticket) => ticket.status === "gueltig" || ticket.status === "eingeloest").length,
  };
}

/** The variants in use, for the filter dropdown - grouped by category so the
 * select can show "Red Castle Club: Gold". */
export async function getVariantOptions(): Promise<Array<{ category: ProductCategory; variant: string; label: string }>> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_variant_catalog")
    .select("category, variant, label")
    .order("category")
    .order("variant");
  if (error) throw new Error(`Failed to load variants: ${error.message}`);
  return (data ?? []).map((row) => ({
    category: row.category as ProductCategory,
    variant: row.variant as string,
    label: row.label as string,
  }));
}

export interface OrderHistoryEntry {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  actor_type: "admin" | "system";
  actor_email: string | null;
  note: string | null;
  created_at: string;
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
  source: OrderSource;
  external_ref: string | null;
  invoice_number: string | null;
  terms_accepted_at: string | null;
  payment_method: string;
  notification_status: NotificationStatus;
  notified_at: string | null;
  notification_error: string | null;
  import_batch_id: string | null;
  customer: {
    name: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    customer_reference: string | null;
    email: string;
    phone: string | null;
    address_street: string | null;
    address_zip: string | null;
    address_city: string | null;
  };
  items: Array<{
    id: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price_rappen: number;
    line_total_rappen: number;
    holder_name: string | null;
    category: ProductCategory | null;
    variant: string | null;
  }>;
  history: OrderHistoryEntry[];
}

export async function getOrderDetail(orderNumber: string): Promise<OrderDetail | null> {
  const supabase = await getSupabaseServerClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, refund_owed, total_rappen, created_at, files_handed_over_at, confirmation_email_sent_at, source, external_ref, invoice_number, terms_accepted_at, payment_method, notification_status, notified_at, notification_error, import_batch_id, customers(name, first_name, last_name, company_name, customer_reference, email, phone, address_street, address_zip, address_city)"
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !order) return null;

  const [{ data: items }, { data: history }] = await Promise.all([
    supabase
      .from("order_items")
      .select("id, product_name_snapshot, quantity, unit_price_rappen, line_total_rappen, holder_name, products(category, variant)")
      .eq("order_id", order.id),
    supabase
      .from("audit_log")
      .select("id, action, field_name, old_value, new_value, actor_type, actor_email, note, created_at")
      .eq("entity_type", "order")
      .eq("entity_id", order.id)
      .order("created_at", { ascending: false }),
  ]);

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
    source: order.source as OrderSource,
    external_ref: order.external_ref,
    invoice_number: order.invoice_number,
    terms_accepted_at: order.terms_accepted_at,
    payment_method: order.payment_method,
    notification_status: order.notification_status as NotificationStatus,
    notified_at: order.notified_at,
    notification_error: order.notification_error,
    import_batch_id: order.import_batch_id,
    customer: {
      name: customer?.name ?? "-",
      first_name: customer?.first_name ?? null,
      last_name: customer?.last_name ?? null,
      company_name: customer?.company_name ?? null,
      customer_reference: customer?.customer_reference ?? null,
      email: customer?.email ?? "-",
      phone: customer?.phone ?? null,
      address_street: customer?.address_street ?? null,
      address_zip: customer?.address_zip ?? null,
      address_city: customer?.address_city ?? null,
    },
    items: (items ?? []).map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return {
        id: item.id,
        product_name_snapshot: item.product_name_snapshot,
        quantity: item.quantity,
        unit_price_rappen: item.unit_price_rappen,
        line_total_rappen: item.line_total_rappen,
        holder_name: item.holder_name,
        category: (product?.category as ProductCategory | null) ?? null,
        variant: product?.variant ?? null,
      };
    }),
    history: (history ?? []) as OrderHistoryEntry[],
  };
}

export interface OrderEmail {
  id: string;
  kind: "order_confirmation" | "order_notification" | "order_info" | "member_cards" | "test";
  recipient: string;
  subject: string | null;
  status: "accepted" | "delivered" | "delayed" | "bounced" | "complained" | "failed";
  statusDetail: string | null;
  sentAt: string;
  statusAt: string | null;
  cardCount: number;
}

/**
 * Every mail this order produced, with what the provider said about it
 * afterwards (D88). "Angenommen" is not "zugestellt": until the provider
 * reports back, that is all the shop can honestly claim.
 */
export async function getOrderEmails(orderId: string): Promise<OrderEmail[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_messages")
    .select("id, kind, recipient, subject, status, status_detail, sent_at, status_at, ticket_ids")
    .eq("order_id", orderId)
    .order("sent_at", { ascending: false });
  if (error) throw new Error(`Failed to load e-mails: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as OrderEmail["kind"],
    recipient: row.recipient as string,
    subject: row.subject as string | null,
    status: row.status as OrderEmail["status"],
    statusDetail: row.status_detail as string | null,
    sentAt: row.sent_at as string,
    statusAt: row.status_at as string | null,
    cardCount: ((row.ticket_ids as string[] | null) ?? []).length,
  }));
}
