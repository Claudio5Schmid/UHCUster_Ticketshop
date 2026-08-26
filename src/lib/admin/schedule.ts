import { getSupabaseServerClient } from "@/lib/supabase-server";

export interface AdminGame {
  id: string;
  season: string;
  opponent: string;
  played_at: string;
  venue: string | null;
  eventfrog_url: string | null;
}

export async function getAllGames(season: string): Promise<AdminGame[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("games")
    .select("id, season, opponent, played_at, venue, eventfrog_url")
    .eq("season", season)
    .order("played_at", { ascending: true });

  if (error) throw new Error(`Failed to load games: ${error.message}`);
  return data ?? [];
}
