import { Container } from "@/components/layout/Container/Container";
import { GameRow } from "@/components/shop/GameRow/GameRow";
import { getUpcomingGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import { EVENTFROG_UHC_USTER_SEARCH_URL } from "@/lib/eventfrog";
import styles from "../home.module.css";

export const metadata = {
  title: "Einzeltickets - UHC Uster Ticketshop",
};

export const revalidate = 60;

export default async function SpielplanPage() {
  const games = await getUpcomingGamesForSeason(CURRENT_SEASON);

  return (
    <div>
      <section className={styles.hero}>
        <Container>
          <span className={styles.heroEyebrow}>Saison {CURRENT_SEASON_LABEL}</span>
          <h1>Heimspiele</h1>
          <p className={styles.heroLead}>
            Einzeltickets für die folgenden Heimspiele gibt es über Eventfrog. Mit
            einer Saisonkarte oder Red-Castle-Club-Karte brauchst du hierfür kein
            zusätzliches Ticket.
          </p>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          {games.length > 0 ? (
            <div className={styles.gamesList}>
              {games.map((game) => (
                <GameRow key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>
              Die Heimspiele der Saison {CURRENT_SEASON_LABEL} werden in Kürze
              veröffentlicht.
            </p>
          )}
          <p className={styles.emptyState}>
            Noch nicht jedes Spiel hat einen eigenen Ticket-Link. Alle Spiele des UHC
            Uster sind gesammelt auf{" "}
            <a href={EVENTFROG_UHC_USTER_SEARCH_URL} target="_blank" rel="noopener noreferrer">
              Eventfrog
            </a>{" "}
            zu finden.
          </p>
        </Container>
      </section>
    </div>
  );
}
