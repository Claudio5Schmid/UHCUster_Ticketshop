import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { verifyScannerSessionToken } from "@/lib/scanner/session";
import { CURRENT_SEASON } from "@/lib/season";

export interface ScannerTicket {
  token: string;
  status: "gueltig" | "eingeloest" | "storniert" | "ersetzt";
  holderName: string | null;
  transferable: boolean;
  productName: string;
  /** ISO timestamp if already scanned (accepted) for this specific game, else null. */
  redeemedAt: string | null;
}

/**
 * The one-time "before doors open" download: every ticket for the season, not
 * just the currently-valid ones - a voided/replaced ticket still needs to be
 * recognized locally (as "voided", not a generic "not found"), and any ticket
 * already redeemed for THIS game shows its redemption time immediately, so a
 * device that restarts mid-game re-syncs correctly instead of re-accepting scans.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const session = token ? verifyScannerSessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("token, status, holder_name, transferable, order_items!inner(product_name_snapshot)")
    .eq("season", CURRENT_SEASON);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: scans, error: scansError } = await supabase
    .from("scan_events")
    .select("scanned_token, scanned_at")
    .eq("game_id", session.gameId)
    .eq("result", "accepted");
  if (scansError) {
    return NextResponse.json({ error: scansError.message }, { status: 500 });
  }

  const redeemedAtByToken = new Map(scans.map((scan) => [scan.scanned_token, scan.scanned_at]));

  const result: ScannerTicket[] = tickets.map((ticket) => {
    const orderItem = Array.isArray(ticket.order_items) ? ticket.order_items[0] : ticket.order_items;
    return {
      token: ticket.token,
      status: ticket.status,
      holderName: ticket.holder_name,
      transferable: ticket.transferable,
      productName: orderItem?.product_name_snapshot ?? "-",
      redeemedAt: redeemedAtByToken.get(ticket.token) ?? null,
    };
  });

  return NextResponse.json({ tickets: result });
}
