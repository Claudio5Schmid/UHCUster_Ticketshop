"use server";

import { after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { CURRENT_SEASON } from "@/lib/season";
import { getClientIp, checkOrderRateLimit } from "@/lib/rate-limit";
import { assertOrderLinkConfigured, buildOrderAccessPath } from "@/lib/orders/access-token";
import { notifyOrderPlaced } from "@/lib/email/order-notifications";
import { verifyTurnstile, issueTicketsAfterCheckout } from "@/lib/orders/checkout";

export interface OrderLineInput {
  productId: string;
  holderName: string;
}

export interface CustomerInput {
  name: string;
  addressStreet: string;
  addressZip: string;
  addressCity: string;
  email: string;
  phone: string;
}

export interface OrderConfirmationItem {
  product_name: string;
  quantity: number;
  unit_price_rappen: number;
  line_total_rappen: number;
  holder_name: string | null;
}

export interface OrderConfirmation {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  totalRappen: number;
  items: OrderConfirmationItem[];
  /** Signed link to this order's status page - the customer's durable way back to
   * the order and, once the office has sent them, to the ticket PDFs (D54, D77). */
  statusPath: string;
}

/**
 * The season-pass checkout. The only thing the client ever sends per line is a
 * product id and a holder name - never a price or quantity. Every price/quantity
 * is resolved inside create_order() from the current `products` row, so there is
 * nothing here for a tampered client request to override.
 *
 * Since the invoice flow (D75/D77) the cards are issued right here, before the
 * confirmation is shown: the office downloads them and sends them with the
 * invoice. Nothing is attached to the automatic mail.
 */
export async function submitOrder(
  customer: CustomerInput,
  lines: OrderLineInput[],
  turnstileToken: string,
  termsAccepted: boolean
): Promise<OrderConfirmation> {
  if (!lines || lines.length === 0) {
    throw new Error("Der Warenkorb ist leer.");
  }
  if (!termsAccepted) {
    throw new Error("Bitte bestätige die Zahlungsbedingungen (30 Tage netto).");
  }

  const clientIp = await getClientIp();
  const withinLimit = await checkOrderRateLimit(clientIp);
  if (!withinLimit) {
    throw new Error("Zu viele Bestellversuche. Bitte versuche es in einigen Minuten erneut.");
  }

  // Checked here, next to the other configuration the checkout depends on, so a
  // missing secret cannot surface after create_order() has already committed.
  assertOrderLinkConfigured();

  const turnstileOk = await verifyTurnstile(turnstileToken);
  if (!turnstileOk) {
    throw new Error("Sicherheitsprüfung fehlgeschlagen. Bitte lade die Seite neu und versuche es erneut.");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_customer: {
      name: customer.name,
      address_street: customer.addressStreet,
      address_zip: customer.addressZip,
      address_city: customer.addressCity,
      address_country: "CH",
      email: customer.email,
      phone: customer.phone,
    },
    p_lines: lines.map((line) => ({ product_id: line.productId, holder_name: line.holderName })),
    p_season: CURRENT_SEASON,
    p_terms_accepted: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  await issueTicketsAfterCheckout(data.order_id, data.order_number);

  const confirmation: OrderConfirmation = {
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    totalRappen: data.total_rappen,
    items: data.items,
    statusPath: buildOrderAccessPath(data.order_number),
  };

  // Runs after the response is flushed, so a slow or failing mail provider never
  // delays the confirmation screen - and never fails an order that is already
  // committed. Whether mail may go out at all is decided inside, from the order's
  // stored source (brief §4).
  after(async () => {
    await notifyOrderPlaced(data.order_id);
  });

  return confirmation;
}
