import { Container } from "@/components/layout/Container/Container";
import { MatchHero } from "@/components/shop/MatchHero/MatchHero";
import { MatchGrid } from "@/components/shop/MatchGrid/MatchGrid";
import { SectionHeader } from "@/components/shop/SectionHeader/SectionHeader";
import { getShopGames } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import { EVENTFROG_UHC_USTER_SEARCH_URL } from "@/lib/eventfrog";
import styles from "../home.module.css";

export const metadata = {
  title: "Einzeltickets - UHC Uster Ticketshop",
};

export const revalidate = 60;

export default async function SpielplanPage() {
  const { now, upcoming: games, heroCandidates } = await getShopGames(CURRENT_SEASON);

  return (
    <div>
      <MatchHero games={heroCandidates} serverNow={now} />

      <section className={styles.section}>
        <Container>
          <SectionHeader
            title="Kommende Spiele"
            note={`Einzeltickets für die Heimspiele der Saison ${CURRENT_SEASON_LABEL} gibt es über Eventfrog. Mit einer Saisonkarte oder Red-Castle-Club-Karte brauchst du hierfür kein zusätzliches Ticket.`}
          />
          {games.length > 0 ? (
            <MatchGrid games={games} />
          ) : (
            <p className={styles.emptyState}>
              Die Heimspiele der Saison {CURRENT_SEASON_LABEL} werden in Kürze
              veröffentlicht.
            </p>
          )}
          <p className={styles.emptyState}>
            Noch nicht jedes Spiel hat einen eigenen Ticket-Link. Alle Spiele des UHC
            Uster sind auf{" "}
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
