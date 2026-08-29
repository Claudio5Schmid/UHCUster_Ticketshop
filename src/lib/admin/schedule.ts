import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface AdminGame {
  id: string;
  season: string;
  opponent: string;
  played_at: string;
  venue: string | null;
  eventfrog_url: string | null;
  scanner_code: string | null;
  manual_override: boolean;
}

export async function getAllGames(season: string): Promise<AdminGame[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, season, opponent, played_at, venue, eventfrog_url, manual_override, game_scanner_codes(code)")
    .eq("season", season)
    .order("played_at", { ascending: true });

  if (error) throw new Error(`Failed to load games: ${error.message}`);

  return (data ?? []).map((game) => {
    const scannerCode = Array.isArray(game.game_scanner_codes) ? game.game_scanner_codes[0] : game.game_scanner_codes;
    return {
      id: game.id,
      season: game.season,
      opponent: game.opponent,
      played_at: game.played_at,
      venue: game.venue,
      eventfrog_url: game.eventfrog_url,
      scanner_code: scannerCode?.code ?? null,
      manual_override: game.manual_override ?? false,
    };
  });
}
