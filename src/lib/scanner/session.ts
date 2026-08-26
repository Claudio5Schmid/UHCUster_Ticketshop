import { createHmac, timingSafeEqual } from "crypto";

/**
 * Scanner devices never get a real Supabase Auth session (docs/ARCHITECTURE.md
 * Phase 7 section, D32): a helper exchanges a per-game code for one of these
 * short-lived signed tokens instead, scoped to exactly one game. Route Handlers
 * verify it themselves (HMAC, own secret - never TICKET_TOKEN_SECRET, a different
 * security domain) and then act via the service-role client.
 */

export interface ScannerSessionPayload {
  gameId: string;
  deviceLabel: string;
  exp: number; // unix seconds
}

function getSecret(): string {
  const secret = process.env.SCANNER_SESSION_SECRET;
  if (!secret) {
    throw new Error("SCANNER_SESSION_SECRET must be set to issue or verify scanner sessions.");
  }
  return secret;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function sign(payload: string): string {
  return base64url(createHmac("sha256", getSecret()).update(payload).digest());
}

export function createScannerSessionToken(gameId: string, deviceLabel: string, validForMs: number): string {
  const payload: ScannerSessionPayload = {
    gameId,
    deviceLabel,
    exp: Math.floor((Date.now() + validForMs) / 1000),
  };
  const payloadEncoded = base64url(Buffer.from(JSON.stringify(payload)));
  return `${payloadEncoded}.${sign(payloadEncoded)}`;
}

/** Returns the payload if the token's signature is valid and it hasn't expired, otherwise null. */
export function verifyScannerSessionToken(token: string): ScannerSessionPayload | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) return null;

  const expectedSignature = sign(payloadEncoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf-8")) as ScannerSessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    if (typeof payload.gameId !== "string" || typeof payload.deviceLabel !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
