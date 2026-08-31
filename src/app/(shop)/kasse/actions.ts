"use server";

import { after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { CURRENT_SEASON } from "@/lib/season";
import { getClientIp, checkOrderRateLimit } from "@/lib/rate-limit";
import { assertOrderLinkConfigured, buildOrderAccessPath, buildOrderAccessUrl } from "@/lib/orders/access-token";
import { sendEmail } from "@/lib/email/ses";
import {
  orderConfirmationSubject,
  orderConfirmationText,
  orderConfirmationHtml,
} from "@/lib/email/order-confirmation";

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
   * the order and, once paid, to the ticket PDFs (docs/DECISIONS.md D54). */
  statusPath: string;
}

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set.");
  }
  if (!token) return false;

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

/**
 * The only thing the client ever sends per line is a product id and a holder name -
 * never a price or quantity. Every price/quantity is resolved inside create_order()
 * from the current `products` row, so there is nothing here for a tampered client
 * request to override.
 */
export async function submitOrder(
  customer: CustomerInput,
  lines: OrderLineInput[],
  turnstileToken: string
): Promise<OrderConfirmation> {
  if (!lines || lines.length === 0) {
    throw new Error("Der Warenkorb ist leer.");
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
  });

  if (error) {
    throw new Error(error.message);
  }

  const confirmation: OrderConfirmation = {
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    totalRappen: data.total_rappen,
    items: data.items,
    statusPath: buildOrderAccessPath(data.order_number),
  };

  // Runs after the response is flushed, so a slow or failing SES never delays the
  // customer's confirmation screen - and, critically, never fails an order that is
  // already committed. The order is the thing that matters; the email is a courtesy
  // copy of it. Failures are logged and left visible as a null
  // orders.confirmation_email_sent_at for the office.
  after(async () => {
    await sendOrderConfirmationEmail(confirmation);
  });

  return confirmation;
}

async function sendOrderConfirmationEmail(confirmation: OrderConfirmation): Promise<void> {
  try {
    const statusUrl = buildOrderAccessUrl(confirmation.orderNumber);
    const sent = await sendEmail({
      to: confirmation.customerEmail,
      subject: orderConfirmationSubject(confirmation.orderNumber),
      // The mail carries the absolute link; the on-screen confirmation only needs
      // the relative path it was already rendered from.
      bodyText: orderConfirmationText({ ...confirmation, statusUrl }),
      bodyHtml: orderConfirmationHtml({ ...confirmation, statusUrl }),
    });

    if (!sent) return;

    const supabase = getSupabaseAdminClient();
    await supabase
      .from("orders")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("order_number", confirmation.orderNumber);
  } catch (emailError) {
    console.error(
      `[order-confirmation] Failed to send confirmation for ${confirmation.orderNumber}:`,
      emailError instanceof Error ? emailError.message : emailError
    );
  }
}
