"use server";

import { getClientIp, checkOrderRateLimit } from "@/lib/rate-limit";
import { findOrderByNumberAndEmail } from "@/lib/orders/customer-view";
import { buildOrderAccessPath } from "@/lib/orders/access-token";

export interface LookupResult {
  path: string | null;
  error: string | null;
}

/**
 * Order-number + e-mail is the fallback for a customer who lost their link, not the
 * main door (docs/DECISIONS.md D54). Order numbers are sequential, so the e-mail is
 * the only real secret in the pair - hence the same IP rate limit the checkout
 * uses, on its own key prefix, and one identical error message whether the number
 * does not exist or the e-mail does not match. Anything more specific would turn
 * this form into a way to enumerate which orders exist.
 *
 * Ten attempts per ten minutes, the same budget the scanner login gets: five was
 * tight enough to lock out somebody who mistypes their own address twice, and the
 * e-mail - not the attempt count - is what actually makes guessing impractical.
 */
export async function lookupOrder(orderNumber: string, email: string): Promise<LookupResult> {
  const trimmedNumber = orderNumber.trim();
  const trimmedEmail = email.trim();

  if (!trimmedNumber || !trimmedEmail) {
    return { path: null, error: "Bitte gib Bestellnummer und E-Mail-Adresse ein." };
  }

  const clientIp = await getClientIp();
  const withinLimit = await checkOrderRateLimit(`order-lookup:${clientIp}`, 10, 10);
  if (!withinLimit) {
    return { path: null, error: "Zu viele Versuche. Bitte versuche es in einigen Minuten erneut." };
  }

  const found = await findOrderByNumberAndEmail(trimmedNumber, trimmedEmail);
  if (!found) {
    return {
      path: null,
      error:
        "Wir konnten keine Bestellung mit diesen Angaben finden. Prüfe die Bestellnummer und die E-Mail-Adresse, mit der du bestellt hast.",
    };
  }

  return { path: buildOrderAccessPath(found), error: null };
}
