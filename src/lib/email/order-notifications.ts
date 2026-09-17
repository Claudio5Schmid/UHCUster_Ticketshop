import { getSupabaseAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/mailer";
import { orderConfirmationSubject, orderConfirmationText, orderConfirmationHtml } from "@/lib/email/order-confirmation";
import { internalOrderSubject, internalOrderText } from "@/lib/email/order-internal";
import { buildOrderAccessUrl } from "@/lib/orders/access-token";
import { getSiteUrl } from "@/lib/site-url";
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/products";

/**
 * The automatic mail after an order is placed - and the one place that decides
 * whether it may go out at all.
 *
 * Only a shop order triggers mail (brief §4). The rule is enforced here, on the
 * order as it stands in the database, not in whichever UI happened to call: an
 * import that reaches this function by mistake still sends nothing, because its
 * rows say `csv_import`. The Phase 3 tests pin exactly that down.
 */

export interface OrderForNotification {
  id: string;
  orderNumber: string;
  source: "shop" | "csv_import";
  createdAt: string;
  totalRappen: number;
  category: ProductCategory | null;
  customer: {
    name: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    email: string;
    phone: string | null;
    addressStreet: string | null;
    addressZip: string | null;
    addressCity: string | null;
    customerReference: string | null;
  };
  items: Array<{ productName: string; quantity: number; holderName: string | null; lineTotalRappen: number }>;
}

export interface OrderNotificationResult {
  /** Why nothing went out, when nothing did. */
  skipped: "source" | null;
  customerSent: boolean;
  internalSent: boolean;
}

/** The customer's confirmation and the office's "create the invoice" note. */
export async function sendOrderPlacedEmails(order: OrderForNotification): Promise<OrderNotificationResult> {
  if (order.source !== "shop") {
    return { skipped: "source", customerSent: false, internalSent: false };
  }

  const statusUrl = buildOrderAccessUrl(order.orderNumber);
  const greetingName = [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim() || order.customer.name;

  const customerSent = await sendEmail({
    to: order.customer.email,
    subject: orderConfirmationSubject(order.orderNumber),
    bodyText: orderConfirmationText({
      orderNumber: order.orderNumber,
      customerName: greetingName,
      totalRappen: order.totalRappen,
      items: order.items.map((item) => ({
        product_name: item.productName,
        holder_name: item.holderName,
        line_total_rappen: item.lineTotalRappen,
      })),
      statusUrl,
    }),
    bodyHtml: orderConfirmationHtml({
      orderNumber: order.orderNumber,
      customerName: greetingName,
      totalRappen: order.totalRappen,
      items: order.items.map((item) => ({
        product_name: item.productName,
        holder_name: item.holderName,
        line_total_rappen: item.lineTotalRappen,
      })),
      statusUrl,
    }),
  });

  const internalSent = await sendInternalNotification(order);

  return { skipped: null, customerSent, internalSent };
}

/**
 * Nothing configured means nothing sent - and a warning in the log, because an
 * office that never hears about orders is a real problem, not a quiet default.
 */
async function sendInternalNotification(order: OrderForNotification): Promise<boolean> {
  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  if (!to) {
    console.warn(`[order-notifications] ORDER_NOTIFICATION_EMAIL is not set - the office was not told about ${order.orderNumber}.`);
    return false;
  }

  const categoryLabel = order.category ? PRODUCT_CATEGORY_LABELS[order.category] : "Shop";
  const contactName = [order.customer.firstName, order.customer.lastName].filter(Boolean).join(" ").trim() || null;
  const addressLines = [
    order.customer.addressStreet,
    [order.customer.addressZip, order.customer.addressCity].filter(Boolean).join(" "),
  ].filter((line): line is string => Boolean(line && line.trim()));

  return sendEmail({
    to,
    subject: internalOrderSubject(order.orderNumber, categoryLabel),
    bodyText: internalOrderText({
      orderNumber: order.orderNumber,
      createdAt: new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(
        new Date(order.createdAt)
      ),
      categoryLabel,
      billingName: order.customer.name,
      companyName: order.customer.companyName,
      contactName,
      email: order.customer.email,
      phone: order.customer.phone,
      addressLines,
      customerReference: order.customer.customerReference,
      items: order.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        lineTotalRappen: item.lineTotalRappen,
      })),
      totalRappen: order.totalRappen,
      adminUrl: `${getSiteUrl()}/admin/orders/${order.orderNumber}`,
    }),
  });
}

interface OrderRow {
  id: string;
  order_number: string;
  source: "shop" | "csv_import";
  created_at: string;
  total_rappen: number;
  customers: {
    name: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    email: string;
    phone: string | null;
    address_street: string | null;
    address_zip: string | null;
    address_city: string | null;
    customer_reference: string | null;
  } | null;
  order_items: Array<{
    product_name_snapshot: string;
    quantity: number;
    holder_name: string | null;
    line_total_rappen: number;
    products: { category: ProductCategory | null } | null;
  }>;
}

/** The order as the database has it - read back rather than trusted from the
 * caller, so `source` is the stored fact. */
export async function loadOrderForNotification(orderId: string): Promise<OrderForNotification | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, source, created_at, total_rappen, customers(name, first_name, last_name, company_name, email, phone, address_street, address_zip, address_city, customer_reference), order_items(product_name_snapshot, quantity, holder_name, line_total_rappen, products(category))"
    )
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (error || !data || !data.customers) return null;

  return {
    id: data.id,
    orderNumber: data.order_number,
    source: data.source,
    createdAt: data.created_at,
    totalRappen: data.total_rappen,
    category: data.order_items[0]?.products?.category ?? null,
    customer: {
      name: data.customers.name,
      firstName: data.customers.first_name,
      lastName: data.customers.last_name,
      companyName: data.customers.company_name,
      email: data.customers.email,
      phone: data.customers.phone,
      addressStreet: data.customers.address_street,
      addressZip: data.customers.address_zip,
      addressCity: data.customers.address_city,
      customerReference: data.customers.customer_reference,
    },
    items: data.order_items.map((item) => ({
      productName: item.product_name_snapshot,
      quantity: item.quantity,
      holderName: item.holder_name,
      lineTotalRappen: item.line_total_rappen,
    })),
  };
}

/**
 * What the checkout schedules after its response has gone out: read the order
 * back, send, and record the customer confirmation. Never throws - the order is
 * committed, the mail is a courtesy copy, and a failure here must not turn a
 * successful order into an error screen (D49).
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const order = await loadOrderForNotification(orderId);
    if (!order) {
      console.error(`[order-notifications] Order ${orderId} not found - nothing sent.`);
      return;
    }

    const result = await sendOrderPlacedEmails(order);
    if (!result.customerSent) return;

    await getSupabaseAdminClient()
      .from("orders")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);
  } catch (emailError) {
    console.error(
      `[order-notifications] Failed to send for order ${orderId}:`,
      emailError instanceof Error ? emailError.message : emailError
    );
  }
}
