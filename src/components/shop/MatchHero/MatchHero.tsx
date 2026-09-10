import type { Game } from "@/lib/games";
import { formatGameDateLine } from "@/lib/gameDate";
import { HeroShell } from "@/components/shop/HeroShell/HeroShell";
import { MatchHeroContent, type HeroGame } from "./MatchHeroContent";

/**
 * The next home game as the page's opener: headline, date line, pairing,
 * crests, countdown, ticket button. Server side this picks the moment and
 * pre-formats every date string; the client part only ticks.
 *
 * `games` are the hero candidates (src/lib/games.ts getShopGames) - a few
 * games, not one, so the client can move to the next one on its own when a
 * game ends between two revalidations. `serverNow` is the instant they were
 * selected at, read in the data layer where a clock is allowed.
 */
export function MatchHero({ games, serverNow }: { games: Game[]; serverNow: number }) {
  const heroGames: HeroGame[] = games.map((game) => ({
    id: game.id,
    opponent: game.opponent,
    played_at: game.played_at,
    dateLine: formatGameDateLine(game.played_at, game.venue),
    eventfrog_url: game.eventfrog_url,
  }));

  return (
    <HeroShell>
      <MatchHeroContent games={heroGames} serverNow={serverNow} />
    </HeroShell>
  );
}
