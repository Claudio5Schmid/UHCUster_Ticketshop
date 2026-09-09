import { MatchCard } from "@/components/shop/MatchCard/MatchCard";
import type { Game } from "@/lib/games";
import styles from "./MatchGrid.module.css";

/** Match cards, three across on desktop, two on tablets, one on phones. */
export function MatchGrid({ games }: { games: Game[] }) {
  return (
    <div className={styles.grid}>
      {games.map((game) => (
        <MatchCard key={game.id} game={game} />
      ))}
    </div>
  );
}
