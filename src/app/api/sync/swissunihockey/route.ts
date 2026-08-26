import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { fetchUpcomingHomeGames } from "@/lib/swissunihockey";
import { CURRENT_SEASON, CURRENT_SEASON_START_YEAR } from "@/lib/season";

/**
 * Scheduled sync: pulls UHC Uster's L-UPL home games (date, time, venue, opponent)
 * from the public Swiss Unihockey API and upserts them into `games`, matched by
 * `external_id` so re-running it updates an existing game (e.g. postponed) rather
 * than duplicating it. Never touches `eventfrog_url` - that stays whatever an admin
 * set, or null until one is configured.
 *
 * Triggered by Vercel Cron (see vercel.json) once deployed; Vercel sends
 * `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set, which
 * is what's checked below so this can't be triggered by an arbitrary public request.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const games = await fetchUpcomingHomeGames(CURRENT_SEASON_START_YEAR);
  const supabase = getSupabaseAdminClient();

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ synced: games.length });
}
