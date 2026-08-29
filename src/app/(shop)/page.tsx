import Image from "next/image";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { ProductCard } from "@/components/shop/ProductCard/ProductCard";
import { GameRow } from "@/components/shop/GameRow/GameRow";
import { getActiveProducts } from "@/lib/products";
import { getUpcomingGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import styles from "./home.module.css";

// Revalidated periodically rather than on every request - admin price/schedule
// changes (Phase 5) show up within a minute without hitting Supabase on every view.
export const revalidate = 60;

export default async function Home() {
  const [products, games] = await Promise.all([
    getActiveProducts(),
    getUpcomingGamesForSeason(CURRENT_SEASON),
  ]);

  const seasonPasses = products.filter((product) => product.type === "season_pass");
  const memberships = products.filter((product) => product.type === "membership");
  const cheapestMembership = memberships[0];
  const upcomingGames = games.slice(0, 3);

  return (
    <div>
      <section className={styles.hero}>
        <Container>
          <span className={styles.heroEyebrow}>Saison {CURRENT_SEASON_LABEL}</span>
          <h1>Sichere dir jetzt deinen Platz</h1>
          <p className={styles.heroLead}>
            Ein Ticket für die ganze Saison: alle Heimspiele des UHC Uster, ohne
            Einzelkauf. Einzeleintritte für einzelne Spiele gibt es weiterhin über
            Eventfrog.
          </p>
          <div className={styles.heroActions}>
            <Button as="a" href="#saisonkarten" variant="accent">
              Saisonkarte sichern
            </Button>
            <Button as="a" href="/spielplan" variant="secondary">
              Spielplan ansehen
            </Button>
          </div>
        </Container>
      </section>

      <section id="saisonkarten" className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Saisonkarten {CURRENT_SEASON_LABEL}</span>
              <h2>Für jede Situation die passende Karte</h2>
            </div>
          </div>
          <div className={styles.cardGrid}>
            {seasonPasses.map((product) => (
              <ProductCard key={product.id} product={product} gameCount={games.length} />
            ))}
          </div>
        </Container>
      </section>

      {cheapestMembership && (
        <section className={styles.section}>
          <Container>
            <div className={styles.teaser}>
              <div className={styles.teaserContent}>
                <Image
                  src="/red-castle-club-icon.png"
                  alt=""
                  width={240}
                  height={164}
                  className={styles.teaserIcon}
                />
                <div>
                  <span className={styles.sectionEyebrow}>Red Castle Club</span>
                  <h2>Mehr als eine Saisonkarte</h2>
                  <p className={styles.teaserText}>
                    Vier Stufen, von der persönlichen Saisonkarte bis zu übertragbaren
                    VIP-Karten mit Gastro-Leistungen an den Heimspielen des
                    L-UPL-Teams.
                  </p>
                </div>
              </div>
              <Button as="a" href="/red-castle-club" variant="secondary">
                Red Castle Club entdecken
              </Button>
            </div>
          </Container>
        </section>
      )}

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Einzelspiele</span>
              <h2>Nächste Heimspiele</h2>
            </div>
            <Button as="a" href="/spielplan" variant="secondary" size="sm">
              Ganzer Spielplan
            </Button>
          </div>
          {upcomingGames.length > 0 ? (
            <div className={styles.gamesList}>
              {upcomingGames.map((game) => (
                <GameRow key={game.id} game={game} />
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>
              Der Spielplan für die Saison {CURRENT_SEASON_LABEL} wird in Kürze
              veröffentlicht. Einzeltickets gibt es dann hier und über Eventfrog.
            </p>
          )}
        </Container>
      </section>
    </div>
  );
}
