import { Button } from "@/components/ui/Button/Button";
import { Matchup } from "@/components/match/Matchup/Matchup";
import type { Game } from "@/lib/games";
import { formatGameDateLine } from "@/lib/gameDate";
import { LEAGUE_LABEL } from "@/lib/season";
import styles from "./MatchCard.module.css";

/**
 * One home game as a card: when and where, the league, the two crests, and
 * the ticket button. Single tickets are sold on Eventfrog (docs/DECISIONS.md
 * D10), so the button always leaves the shop - or waits, disabled, for a game
 * whose link isn't set yet.
 */
export function MatchCard({ game }: { game: Game }) {
  return (
    <article className={styles.card}>
      <p className={styles.date}>{formatGameDateLine(game.played_at, game.venue)}</p>
      <p className={styles.league}>{LEAGUE_LABEL}</p>
      <div className={styles.crests}>
        <Matchup opponent={game.opponent} layout="compact" />
      </div>
      <div className={styles.action}>
        {game.eventfrog_url ? (
          <Button
            as="a"
            href={game.eventfrog_url}
            target="_blank"
            rel="noopener noreferrer"
            variant="accent"
            shape="pill"
            fullWidth
          >
            Tickets kaufen
          </Button>
        ) : (
          <Button variant="accent" shape="pill" fullWidth disabled title="Ticketlink folgt">
            Tickets folgen
          </Button>
        )}
      </div>
    </article>
  );
}
