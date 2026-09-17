import { createHmac, timingSafeEqual } from "crypto";

/**
 * Resend signs its webhooks with Svix's scheme, and this verifies it by hand
 * rather than pulling in the SDK for one route: the whole scheme is an HMAC
 * over three concatenated values, and a dependency that ships its own HTTP
 * client and crypto is a poor trade for twenty lines.
 *
 * The signed content is `${id}.${timestamp}.${rawBody}`, keyed with the secret
 * after its `whsec_` prefix, base64-decoded. The signature header carries one or
 * more space-separated `v1,<base64>` entries - more than one during a secret
 * rotation - and any of them matching is a pass.
 *
 * The raw body has to be the bytes as received. Parsing and re-serialising the
 * JSON first would change key order or spacing and the signature would never
 * match again.
 */

/** How far a timestamp may be from now. Svix's own tolerance, and what stops a
 *  captured request being replayed later. */
const TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type VerificationResult = { ok: true } | { ok: false; reason: string };

export function verifyResendSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  now: Date = new Date()
): VerificationResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing signature headers" };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "invalid timestamp" };
  const drift = Math.abs(Math.floor(now.getTime() / 1000) - sentAt);
  if (drift > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();

  // Every candidate is compared, and compared in constant time, so neither a
  // rotation nor the comparison itself leaks which one was close.
  const candidates = signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => Buffer.from(part.slice(3), "base64"));

  if (candidates.length === 0) return { ok: false, reason: "no v1 signature" };

  const matched = candidates.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected));
  return matched ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
