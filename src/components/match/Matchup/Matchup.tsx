import { TeamLogo } from "@/components/match/TeamLogo/TeamLogo";
import { HOME_TEAM } from "@/lib/teamLogos";
import styles from "./Matchup.module.css";

interface MatchupProps {
  opponent: string;
  /** "sm" for dense chrome (scanner bar, admin tables); "md" for the shop's fixture rows. */
  size?: "sm" | "md";
  /**
   * Prints the opponent's name beside the crests. Off in the shop, where the
   * crests are the point; on wherever somebody has to be *certain* which game
   * they are looking at - picking a scanner session, editing a fixture - because
   * recognising a crest at a glance is not the same as reading a name.
   */
  showName?: boolean;
}

/**
 * One fixture, as UHC Uster against the visiting club. Every game in this app is
 * a home game, so the home side is always Uster and always on the left.
 */
export function Matchup({ opponent, size = "md", showName = false }: MatchupProps) {
  return (
    <span className={size === "sm" ? `${styles.matchup} ${styles.sm}` : styles.matchup}>
      {/* Each club sits centred in a column of its own. Without that the crests
          are flush against "vs." and, since they are all different widths, the
          list frays down its outer edges. */}
      <span className={`${styles.side} ${styles.home}`}>
        <TeamLogo team={HOME_TEAM} size={size} decorative={showName} />
      </span>
      {/* Readable, not aria-hidden: with the clubs carried only by the crests'
          alt text, this is what tells a screen reader they are playing each other. */}
      <span className={styles.versus}>vs.</span>
      <span className={`${styles.side} ${styles.away}`}>
        <TeamLogo team={opponent} size={size} decorative={showName} />
      </span>
      {showName && <span className={styles.name}>{opponent}</span>}
    </span>
  );
}
