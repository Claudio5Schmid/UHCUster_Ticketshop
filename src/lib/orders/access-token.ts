import { createHmac, timingSafeEqual } from "crypto";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Signed customer order links (docs/DECISIONS.md D54). This shop has no customer
 * accounts and no online payment, so the only thing a buyer can be handed after
 * checkout is a link - and order numbers are sequential (UHCU-2627-0001), so the
 * link cannot be the bare number. It carries an HMAC over the order number
 * instead: guessing the number gets nobody anywhere without the signature.
 *
 * Own secret, never TICKET_TOKEN_SECRET or SCANNER_SESSION_SECRET - a different
 * security domain, the same rule the scanner session already follows.
 *
 * Deliberately no expiry, unlike the scanner session. This link is the customer's
 * only durable way back to their season pass, and that pass is valid for the whole
 * season; an expiring link would mean "lost your PDF, call the office", which is
 * exactly the work this feature removes. Revoking access to a single order is not
 * supported and does not need to be: the artefact behind it is a season pass PDF
 * that the customer paid for and already has a copy of.
 */

function getSecret(): string {
  const secret = process.env.ORDER_LINK_SECRET;
  if (!secret) {
    throw new Error("ORDER_LINK_SECRET must be set to create or verify customer order links.");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Fails fast if the secret is missing. Called at the top of checkout, before the
 * order is written: a misconfigured deployment must break *before* an order exists,
 * not after - otherwise the customer sees an error for an order that was in fact
 * created, and orders it again. */
export function assertOrderLinkConfigured(): void {
  getSecret();
}

export function createOrderAccessToken(orderNumber: string): string {
  const payload = Buffer.from(orderNumber).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the order number if the signature holds, otherwise null. */
export function verifyOrderAccessToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const orderNumber = Buffer.from(payload, "base64url").toString("utf-8");
  // The signature already proves this string came from us, so the shape check is
  // only here to keep a malformed-but-signed value from reaching a query.
  if (!/^UHCU-\d{4}-\d{4}$/.test(orderNumber)) return null;
  return orderNumber;
}

export function buildOrderAccessPath(orderNumber: string): string {
  return `/meine-tickets/${createOrderAccessToken(orderNumber)}`;
}

export function buildOrderAccessUrl(orderNumber: string): string {
  return `${getSiteUrl()}${buildOrderAccessPath(orderNumber)}`;
}
