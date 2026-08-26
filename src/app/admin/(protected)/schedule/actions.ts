"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { fetchUpcomingHomeGames } from "@/lib/swissunihockey";
import { CURRENT_SEASON, CURRENT_SEASON_START_YEAR } from "@/lib/season";

export async function setGameEventfrogUrl(gameId: string, eventfrogUrl: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("games")
    .update({ eventfrog_url: eventfrogUrl || null })
    .eq("id", gameId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/spielplan");
  revalidatePath("/");
}

export async function setGameScannerCode(gameId: string, code: string) {
  const supabase = await getSupabaseServerClient();
  const trimmed = code.trim();

  if (!trimmed) {
    const { error } = await supabase.from("game_scanner_codes").delete().eq("game_id", gameId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("game_scanner_codes").upsert({ game_id: gameId, code: trimmed });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin/schedule");
}

/**
 * Same sync as /api/sync/swissunihockey, but triggered by an admin from the UI -
 * uses the admin's own session (RLS + is_admin()) instead of the service-role
 * client, since this is exactly the kind of admin-attributed action that pattern
 * is for, and it's already gated by the admin layout's auth check.
 */
export async function syncGamesNow(): Promise<{ synced: number }> {
  const games = await fetchUpcomingHomeGames(CURRENT_SEASON_START_YEAR);
  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.from("games").upsert(
    games.map((game) => ({
      external_id: game.externalId,
      season: CURRENT_SEASON,
      opponent: game.opponent,
      played_at: game.playedAt.toISOString(),
      venue: game.venue,
    })),
    { onConflict: "external_id" }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/schedule");
  revalidatePath("/spielplan");
  revalidatePath("/");

  return { synced: games.length };
}
