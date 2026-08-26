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
