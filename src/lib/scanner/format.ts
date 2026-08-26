/**
 * Cheap, offline, client-side pre-filter for garbage/malformed scans - NOT real
 * signature verification. The HMAC secret that produced a real token never
 * reaches the client (docs/ARCHITECTURE.md D13/Phase 7 section), so the client
 * can only check that a scanned string has the right shape (26 Base32
 * characters, see src/lib/tickets/token.ts), not that it was genuinely signed.
 * A well-formed but unauthorized token still gets caught next, by the "not in
 * the local valid-ticket set" check - this is only step one.
 */
const TOKEN_SHAPE = /^[A-Z2-7]{26}$/;

export function hasPlausibleTokenShape(scanned: string): boolean {
  return TOKEN_SHAPE.test(scanned.trim().toUpperCase());
}
