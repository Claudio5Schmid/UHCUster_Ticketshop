"use client";

import { Button } from "@/components/ui/Button/Button";
import { Matchup } from "@/components/match/Matchup/Matchup";
import { Countdown } from "@/components/shop/Countdown/Countdown";
import { HeroTitle } from "@/components/shop/HeroShell/HeroShell";
import { selectHeroGame } from "@/lib/games";
import { useNow } from "@/lib/useNow";
import { EVENTFROG_UHC_USTER_SEARCH_URL } from "@/lib/eventfrog";
import { CURRENT_SEASON_LABEL } from "@/lib/season";
import { HOME_TEAM } from "@/lib/teamLogos";
import styles from "./MatchHero.module.css";

/** The slice of a Game the hero needs, keeping the snake_case field names so
 * the pure helpers in src/lib/games.ts work on it unchanged. */
export interface HeroGame {
  id: string;
  opponent: string;
  played_at: string;
  /** Pre-formatted on the server (src/lib/gameDate.ts) - never formatted here. */
  dateLine: string;
  eventfrog_url: string | null;
}

interface MatchHeroContentProps {
  games: HeroGame[];
  serverNow: number;
}

export function MatchHeroContent({ games, serverNow }: MatchHeroContentProps) {
  const now = useNow(serverNow);
  const game = selectHeroGame(games, now);

  if (!game) {
    return (
      <>
        <HeroTitle>Sichere dir deinen Platz</HeroTitle>
        <p className={styles.lead}>
          Die Heimspiele der Saison {CURRENT_SEASON_LABEL} werden in Kürze veröffentlicht.
          Einzeltickets gibt es dann hier und über Eventfrog.
        </p>
        <div className={styles.action}>
          <Button
            as="a"
            href={EVENTFROG_UHC_USTER_SEARCH_URL}
            target="_blank"
            rel="noopener noreferrer"
            variant="accent"
            shape="pill"
          >
            Alle Spiele auf Eventfrog
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <HeroTitle>Sichere dir deinen Platz</HeroTitle>
      <p className={styles.date}>{game.dateLine}</p>
      <p className={styles.pairing}>
        {HOME_TEAM} - {game.opponent}
      </p>
      <div className={styles.crests}>
        <Matchup opponent={game.opponent} size="md" />
      </div>
      <Countdown playedAt={game.played_at} now={now} />
      <div className={styles.action}>
        {game.eventfrog_url ? (
          <Button
            as="a"
            href={game.eventfrog_url}
            target="_blank"
            rel="noopener noreferrer"
            variant="accent"
            shape="pill"
          >
            Tickets kaufen
          </Button>
        ) : (
          <Button variant="accent" shape="pill" disabled title="Ticketlink folgt">
            Tickets folgen
          </Button>
        )}
      </div>
    </>
  );
}
