import { getSupabaseServerClient } from "@/lib/supabase-server";
import { CURRENT_SEASON } from "@/lib/season";

export interface LiveGameStats {
  redeemed: number;
  outstanding: number;
  rejections: number;
  totalValidTickets: number;
}

/**
 * "Outstanding" means season-pass holders who haven't checked in for THIS game
 * yet - not unsold inventory (there's nothing left to sell mid-season). A
 * season pass is valid at every home game, so the same ticket can be
 * "redeemed" at one game and "outstanding" at the next.
 */
export async function getLiveGameStats(gameId: string): Promise<LiveGameStats> {
  const supabase = await getSupabaseServerClient();

  const [{ count: totalValidTickets }, { count: redeemed }, { count: rejections }] = await Promise.all([
    supabase.from("tickets").select("*", { count: "exact", head: true }).eq("season", CURRENT_SEASON).eq("status", "gueltig"),
    supabase.from("scan_events").select("*", { count: "exact", head: true }).eq("game_id", gameId).eq("result", "accepted"),
    supabase.from("scan_events").select("*", { count: "exact", head: true }).eq("game_id", gameId).neq("result", "accepted"),
  ]);

  return {
    totalValidTickets: totalValidTickets ?? 0,
    redeemed: redeemed ?? 0,
    rejections: rejections ?? 0,
    outstanding: Math.max(0, (totalValidTickets ?? 0) - (redeemed ?? 0)),
  };
}

export interface ScanLogEntry {
  id: string;
  scannedAt: string;
  result: "accepted" | "already_redeemed" | "invalid_signature" | "not_found" | "wrong_game" | "voided";
  deviceId: string;
  holderName: string | null;
  productName: string | null;
}

interface ScanLogRow {
  id: string;
  scanned_at: string;
  result: ScanLogEntry["result"];
  device_id: string;
  tickets: { holder_name: string | null; products: { name: string } | { name: string }[] | null } | { holder_name: string | null; products: { name: string } | { name: string }[] | null }[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** The individual scan log for a game (docs/BACKLOG.md admin tooling gap) -
 * getLiveGameStats only gives aggregate counts, not enough to investigate a
 * suspected double-scan or a run of rejections without querying the table
 * directly. Newest first, since that's what an admin troubleshooting a
 * just-happened incident wants to see. */
export async function getScanLogForGame(gameId: string): Promise<ScanLogEntry[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("scan_events")
    .select("id, scanned_at, result, device_id, tickets(holder_name, products(name))")
    .eq("game_id", gameId)
    .order("scanned_at", { ascending: false });

  if (error) throw new Error(`Failed to load scan log: ${error.message}`);

  return ((data ?? []) as ScanLogRow[]).map((row) => {
    const ticket = firstOf(row.tickets);
    const product = ticket ? firstOf(ticket.products) : null;
    return {
      id: row.id,
      scannedAt: row.scanned_at,
      result: row.result,
      deviceId: row.device_id,
      holderName: ticket?.holder_name ?? null,
      productName: product?.name ?? null,
    };
  });
}
