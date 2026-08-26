import { getSupabaseClient } from "@/lib/supabase";

export interface Game {
  id: string;
  season: string;
  opponent: string;
  played_at: string;
  venue: string | null;
  eventfrog_url: string | null;
}

export async function getGamesForSeason(season: string): Promise<Game[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, season, opponent, played_at, venue, eventfrog_url")
    .eq("season", season)
    .order("played_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load games: ${error.message}`);
  }

  return data ?? [];
}

/** Only games that haven't been played yet - what the shop should actually list. */
export async function getUpcomingGamesForSeason(season: string): Promise<Game[]> {
  const games = await getGamesForSeason(season);
  const now = Date.now();
  return games.filter((game) => new Date(game.played_at).getTime() >= now);
}
