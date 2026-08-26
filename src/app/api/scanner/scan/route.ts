import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { verifyScannerSessionToken } from "@/lib/scanner/session";

type ScanResult = "accepted" | "already_redeemed" | "invalid_signature" | "not_found" | "wrong_game" | "voided";

interface ScanResponse {
  result: ScanResult;
  productName?: string;
  holderName?: string | null;
  transferable?: boolean;
  /** Set when result is already_redeemed - when the earlier accepted scan happened. */
  redeemedAt?: string;
}

const UNIQUE_VIOLATION = "23505";

/**
 * The server-authoritative half of a scan. The client already decided
 * accept/reject locally from its pre-downloaded set (that's the whole point of
 * the offline-first design - this call never blocks the on-screen result) and
 * fires this in the background to log the attempt and get a final ruling on
 * "accepted", since two devices can race on the same ticket a few milliseconds
 * apart before their Realtime broadcasts arrive. The partial unique index on
 * scan_events (ticket_id, game_id) where result = 'accepted' is what actually
 * decides that race, not application logic - this route just reacts to it.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const session = token ? verifyScannerSessionToken(token) : null;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const scannedToken = typeof body?.scannedToken === "string" ? body.scannedToken : null;
  if (!scannedToken) {
    return NextResponse.json({ error: "scannedToken is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, status, holder_name, transferable, order_items!inner(product_name_snapshot)")
    .eq("token", scannedToken)
    .maybeSingle();

  if (!ticket) {
    await supabase.from("scan_events").insert({
      scanned_token: scannedToken,
      ticket_id: null,
      game_id: session.gameId,
      result: "not_found",
      device_id: session.deviceLabel,
    });
    return NextResponse.json<ScanResponse>({ result: "not_found" });
  }

  const orderItem = Array.isArray(ticket.order_items) ? ticket.order_items[0] : ticket.order_items;
  const ticketInfo = {
    productName: orderItem?.product_name_snapshot ?? "-",
    holderName: ticket.holder_name,
    transferable: ticket.transferable,
  };

  if (ticket.status !== "gueltig") {
    await supabase.from("scan_events").insert({
      scanned_token: scannedToken,
      ticket_id: ticket.id,
      game_id: session.gameId,
      result: "voided",
      device_id: session.deviceLabel,
    });
    return NextResponse.json<ScanResponse>({ result: "voided", ...ticketInfo });
  }

  const { error: insertError } = await supabase.from("scan_events").insert({
    scanned_token: scannedToken,
    ticket_id: ticket.id,
    game_id: session.gameId,
    result: "accepted",
    device_id: session.deviceLabel,
  });

  if (!insertError) {
    return NextResponse.json<ScanResponse>({ result: "accepted", ...ticketInfo });
  }

  if ((insertError as { code?: string }).code === UNIQUE_VIOLATION) {
    const { data: earlierScan } = await supabase
      .from("scan_events")
      .select("scanned_at")
      .eq("ticket_id", ticket.id)
      .eq("game_id", session.gameId)
      .eq("result", "accepted")
      .order("scanned_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    await supabase.from("scan_events").insert({
      scanned_token: scannedToken,
      ticket_id: ticket.id,
      game_id: session.gameId,
      result: "already_redeemed",
      device_id: session.deviceLabel,
    });

    return NextResponse.json<ScanResponse>({
      result: "already_redeemed",
      ...ticketInfo,
      redeemedAt: earlierScan?.scanned_at,
    });
  }

  return NextResponse.json({ error: insertError.message }, { status: 500 });
}
