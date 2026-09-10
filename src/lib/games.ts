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

/**
 * How long after the kick-off a game still counts as "on" for the hero. Three
 * hours covers a full match plus overtime and shoot-out with room to spare;
 * after that the hero moves on to the next game.
 */
export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** How many games the hero takes along, so it can move on client-side when
 * one ends between two ISR revalidations. */
const HERO_CANDIDATE_COUNT = 3;

/** Only games that haven't kicked off yet - what the match cards list. */
export function filterUpcoming<T extends { played_at: string }>(games: T[], now: number): T[] {
  return games.filter((game) => new Date(game.played_at).getTime() >= now);
}

/** Games the hero can show: still to come, or kicked off less than the live
 * window ago. Sorted ascending already (getGamesForSeason orders by played_at). */
export function filterHeroCandidates<T extends { played_at: string }>(games: T[], now: number): T[] {
  return games
    .filter((game) => new Date(game.played_at).getTime() + LIVE_WINDOW_MS > now)
    .slice(0, HERO_CANDIDATE_COUNT);
}

/** The game the hero shows right now: the first candidate whose live window
 * hasn't closed. Pure, so the server and the ticking client agree. */
export function selectHeroGame<T extends { played_at: string }>(games: T[], now: number): T | null {
  return games.find((game) => new Date(game.played_at).getTime() + LIVE_WINDOW_MS > now) ?? null;
}

/** Only games that haven't been played yet - what the shop should actually list. */
export async function getUpcomingGamesForSeason(season: string): Promise<Game[]> {
  const games = await getGamesForSeason(season);
  return filterUpcoming(games, Date.now());
}

export interface ShopGames {
  /** The instant both lists were cut at - the hero counts down from it. */
  now: number;
  upcoming: Game[];
  heroCandidates: Game[];
}

/** One query, both lists the shop landing pages need, cut at the same instant.
 * The clock is read here rather than in the page: a component render has to be
 * pure (react-hooks/purity), a data function doesn't. */
export async function getShopGames(season: string): Promise<ShopGames> {
  const games = await getGamesForSeason(season);
  const now = Date.now();
  return {
    now,
    upcoming: filterUpcoming(games, now),
    heroCandidates: filterHeroCandidates(games, now),
  };
}

export type CountdownState =
  | { kind: "upcoming"; days: number; hours: number; minutes: number }
  | { kind: "live" }
  | { kind: "over" };

/** Where a game stands relative to `now`, in whole days/hours/minutes left. */
export function getCountdownState(playedAt: string, now: number): CountdownState {
  const kickoff = new Date(playedAt).getTime();
  const remaining = kickoff - now;

  if (remaining <= 0) {
    return now < kickoff + LIVE_WINDOW_MS ? { kind: "live" } : { kind: "over" };
  }

  const totalMinutes = Math.floor(remaining / 60_000);
  return {
    kind: "upcoming",
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes / 60) % 24),
    minutes: totalMinutes % 60,
  };
}
