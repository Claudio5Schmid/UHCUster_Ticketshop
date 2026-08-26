import { createHmac, randomUUID } from "crypto";

/**
 * Signed ticket tokens (docs/ARCHITECTURE.md #4, D13): HMAC-SHA256 over a fresh
 * ticket id, Base32-encoded, kept well under the 40-character budget. The secret
 * never leaves this server-side module - the scanner (Phase 7) treats a token as
 * an opaque lookup key against its pre-downloaded valid-ticket set; the signature
 * is only a cheap pre-filter against garbage/forged scans, not the source of truth.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function getSecret(): string {
  const secret = process.env.TICKET_TOKEN_SECRET;
  if (!secret) {
    throw new Error("TICKET_TOKEN_SECRET must be set to issue tickets.");
  }
  return secret;
}

export interface GeneratedTicketId {
  id: string;
  token: string;
}

/** Picks a fresh ticket id and derives its token from it. 26 Base32 characters
 * of a SHA-256 HMAC is 130 bits of truncated digest - not brute-forceable, and
 * comfortably under the 40-character budget. */
export function generateTicketId(): GeneratedTicketId {
  const id = randomUUID();
  const digest = createHmac("sha256", getSecret()).update(id).digest();
  const token = base32Encode(digest).slice(0, 26);
  return { id, token };
}
