import { Button } from "@/components/ui/Button/Button";
import type { Game } from "@/lib/games";
import styles from "./GameRow.module.css";

interface GameRowProps {
  game: Game;
}

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
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
        <span className={styles.date}>{formattedDate}</span>
        <span className={styles.opponent}>UHC Uster - {game.opponent}</span>
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
