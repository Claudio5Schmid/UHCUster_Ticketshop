import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { createScannerSessionToken } from "@/lib/scanner/session";
import { getClientIp, checkOrderRateLimit } from "@/lib/rate-limit";

const SESSION_VALID_MS = 8 * 60 * 60 * 1000; // 8 hours - covers setup, the game, and a buffer

/**
 * Exchanges a per-game scanner code for a short-lived signed session token.
 * No Supabase Auth session involved - helpers are anonymous devices, verified only
 * by knowing the code an admin gave them for this specific game (D32). Codes are
 * short, human-typed strings, not high-entropy secrets, so this endpoint is
 * brute-forceable without a rate limit - reuses the same order_rate_limits
 * mechanism (a distinct key prefix, not a separate table) rather than allowing
 * unlimited guesses.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const gameId = typeof body?.gameId === "string" ? body.gameId : null;
  const code = typeof body?.code === "string" ? body.code.trim() : null;
  const deviceLabel = typeof body?.deviceLabel === "string" ? body.deviceLabel.trim() : null;

  if (!gameId || !code || !deviceLabel) {
    return NextResponse.json({ error: "gameId, code, and deviceLabel are required" }, { status: 400 });
  }

  const clientIp = await getClientIp();
  const withinLimit = await checkOrderRateLimit(`scanner-session:${clientIp}`, 10, 10);
  if (!withinLimit) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte kurz warten." }, { status: 429 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: scannerCode, error } = await supabase
    .from("game_scanner_codes")
    .select("code")
    .eq("game_id", gameId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!scannerCode || scannerCode.code !== code) {
    return NextResponse.json({ error: "Ungültiger Scanner-Code." }, { status: 401 });
  }

  const token = createScannerSessionToken(gameId, deviceLabel, SESSION_VALID_MS);
  return NextResponse.json({ token, expiresInMs: SESSION_VALID_MS });
}
