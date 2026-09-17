"use server";

import { after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { CURRENT_SEASON } from "@/lib/season";
import { getClientIp, checkOrderRateLimit } from "@/lib/rate-limit";
import { assertOrderLinkConfigured, buildOrderAccessPath } from "@/lib/orders/access-token";
import { getActiveProductByVariant } from "@/lib/products";
import { ticketNameFor } from "@/lib/tickets/ticket-name";
import { notifyOrderPlaced } from "@/lib/email/order-notifications";
import { verifyTurnstile, issueTicketsAfterCheckout } from "@/lib/orders/checkout";
import { getSalesChannels, resolvePurchase } from "@/lib/shop/sales-channels";

export interface RedCastleOrderInput {
  variant: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressStreet: string;
  addressZip: string;
  addressCity: string;
  customerReference: string;
  termsAccepted: boolean;
}

export interface RedCastleOrderConfirmation {
  orderNumber: string;
  productName: string;
  quantity: number;
  ticketName: string;
  billingName: string;
  customerEmail: string;
  totalRappen: number;
  statusPath: string;
}

/**
 * The Red Castle Club order (brief §2, D70/D73/D74/D76/D77): one package, on
 * invoice, cards issued at once and handed over by the office with the invoice.
 * The client sends the variant key, never a product id or price; the package
 * is resolved here from the catalog and priced by the database.
 */
export async function submitRedCastleOrder(input: RedCastleOrderInput, turnstileToken: string): Promise<RedCastleOrderConfirmation> {
  if (!input.termsAccepted) {
    throw new Error("Bitte bestätige die Zahlungsbedingungen (30 Tage netto).");
  }
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error("Bitte Vor- und Nachname der bestellenden Person angeben.");
  }

  const clientIp = await getClientIp();
  if (!(await checkOrderRateLimit(clientIp))) {
    throw new Error("Zu viele Bestellversuche. Bitte versuche es in einigen Minuten erneut.");
  }

  assertOrderLinkConfigured();

  if (!(await verifyTurnstile(turnstileToken))) {
    throw new Error("Sicherheitsprüfung fehlgeschlagen. Bitte lade die Seite neu und versuche es erneut.");
  }

  const [product, channels] = await Promise.all([getActiveProductByVariant("red_castle", input.variant), getSalesChannels()]);
  if (!product) {
    throw new Error("Dieses Paket ist zurzeit nicht bestellbar.");
  }
  if (resolvePurchase(product, channels).kind !== "cart") {
    throw new Error("Der Red Castle Club wird zurzeit nicht über den Ticketshop verkauft.");
  }

  const ticketName = ticketNameFor({
    category: "red_castle",
    companyName: input.companyName,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_customer: {
      first_name: input.firstName,
      last_name: input.lastName,
      company_name: input.companyName,
      customer_reference: input.customerReference,
      address_street: input.addressStreet,
      address_zip: input.addressZip,
      address_city: input.addressCity,
      address_country: "CH",
      email: input.email,
      phone: input.phone,
    },
    p_lines: [{ product_id: product.id, holder_name: ticketName }],
    p_season: CURRENT_SEASON,
    p_terms_accepted: true,
  });
  if (error) {
    throw new Error(error.message);
  }

  await issueTicketsAfterCheckout(data.order_id, data.order_number);

  after(async () => {
    await notifyOrderPlaced(data.order_id);
  });

  const item = data.items[0] as { product_name: string; quantity: number; line_total_rappen: number };
  return {
    orderNumber: data.order_number,
    productName: item.product_name,
    quantity: item.quantity,
    ticketName,
    billingName: data.customer_name,
    customerEmail: data.customer_email,
    totalRappen: data.total_rappen,
    statusPath: buildOrderAccessPath(data.order_number),
  };
}
