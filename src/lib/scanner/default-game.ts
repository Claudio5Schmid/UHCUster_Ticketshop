import type { Game } from "@/lib/games";

/**
 * Which game the scanner's login should offer first.
 *
 * This matters more than it looks: the whole scanner session is bound to the
 * game picked here - the ticket download, what "already scanned" is measured
 * against, and which game every scan is logged to. Offering the wrong one and
 * having a helper not notice means scanning an entire evening into the wrong
 * game, where every season pass reads as already redeemed. Before this existed
 * the list simply offered its first entry, which is the season opener in
 * September for the rest of the season.
 *
 * A helper can still pick any other game from the dropdown.
 */

/** "YYYY-MM-DD" as it reads in Uster, not wherever the server happens to run. */
function zurichDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function pickDefaultGameId(games: Game[], now: Date = new Date()): string {
  if (games.length === 0) {
    return "";
  }

  const byKickoff = [...games].sort(
    (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime()
  );

  // A game today is the answer whatever the clock says - helpers set up hours
  // before doors open, and the game is still "today's" once it has started.
  const today = zurichDate(now);
  const todaysGame = byKickoff.find((game) => zurichDate(game.played_at) === today);
  if (todaysGame) {
    return todaysGame.id;
  }

  // Otherwise the next one up, so testing the scanner on a quiet Tuesday offers
  // the game it is being tested for.
  const nextGame = byKickoff.find((game) => new Date(game.played_at).getTime() >= now.getTime());
  if (nextGame) {
    return nextGame.id;
  }

  // Season over: the most recent game, rather than jumping back to the opener.
  return byKickoff[byKickoff.length - 1].id;
}
