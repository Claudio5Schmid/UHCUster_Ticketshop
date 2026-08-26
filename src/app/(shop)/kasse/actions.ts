"use server";

import { getSupabaseAdminClient } from "@/lib/supabase";
import { CURRENT_SEASON } from "@/lib/season";

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

  return {
    orderNumber: data.order_number,
    customerName: data.customer_name,
    customerEmail: data.customer_email,
    totalRappen: data.total_rappen,
    items: data.items,
  };
}
