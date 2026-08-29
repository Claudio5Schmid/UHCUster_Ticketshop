import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUpcomingHomeGames } from "@/lib/swissunihockey";
import { CURRENT_SEASON, CURRENT_SEASON_START_YEAR } from "@/lib/season";

export interface SyncResult {
  synced: number;
  skipped: number;
}

/**
 * Upserts Swiss Unihockey's home games into `games`, matched on external_id.
 *
 * Games an admin has hand-corrected (manual_override = true) are left completely
 * untouched: without this, the next sync - cron or button - would silently revert a
 * correction the office made because Swiss Unihockey had the wrong date. Never touches
 * eventfrog_url or manual_override on any row.
 *
 * Shared by the Vercel cron route and the admin's sync button so the two can't drift
 * apart on which rows they're allowed to overwrite.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncGamesFromSwissUnihockey(supabase: SupabaseClient<any, any, any>): Promise<SyncResult> {
  const games = await fetchUpcomingHomeGames(CURRENT_SEASON_START_YEAR);

  const { data: overridden, error: overrideError } = await supabase
    .from("games")
    .select("external_id")
    .eq("season", CURRENT_SEASON)
    .eq("manual_override", true);
  if (overrideError) throw new Error(overrideError.message);

  const lockedExternalIds = new Set((overridden ?? []).map((row) => row.external_id).filter(Boolean));
  const syncable = games.filter((game) => !lockedExternalIds.has(game.externalId));

  if (syncable.length > 0) {
    const { error } = await supabase.from("games").upsert(
      syncable.map((game) => ({
        external_id: game.externalId,
        season: CURRENT_SEASON,
        opponent: game.opponent,
        played_at: game.playedAt.toISOString(),
        venue: game.venue,
      })),
      { onConflict: "external_id" }
    );
    if (error) throw new Error(error.message);
  }

  return { synced: syncable.length, skipped: games.length - syncable.length };
}
