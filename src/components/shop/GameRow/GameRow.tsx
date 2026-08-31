import { Button } from "@/components/ui/Button/Button";
import { Matchup } from "@/components/match/Matchup/Matchup";
import type { Game } from "@/lib/games";
import styles from "./GameRow.module.css";

interface GameRowProps {
  game: Game;
}

// Explicit timeZone: played_at is stored correctly in UTC, but the server rendering
// this (Vercel) doesn't default to Europe/Zurich - without this, game times would
// silently shift depending on where the app happens to run.
const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function GameRow({ game }: GameRowProps) {
  const formattedDate = dateFormatter.format(new Date(game.played_at));

  return (
    <div className={styles.row}>
      <div className={styles.info}>
        {/* Venue sits with the date rather than under the crest: both are details
            of when and where, and a text line under the crest would start further
            left than the crest itself, which is centred in its fixed box. */}
        <div className={styles.when}>
          <span className={styles.date}>{formattedDate}</span>
          {game.venue && <span className={styles.venue}>{game.venue}</span>}
        </div>
        <Matchup opponent={game.opponent} />
      </div>
      {game.eventfrog_url ? (
        <Button as="a" href={game.eventfrog_url} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
          Tickets auf Eventfrog
        </Button>
      ) : (
        <Button variant="secondary" size="sm" disabled title="Ticketlink folgt">
          Tickets folgen
        </Button>
      )}
    </div>
  );
}
