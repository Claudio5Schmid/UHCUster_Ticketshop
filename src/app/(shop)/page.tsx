import Image from "next/image";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { ProductCard } from "@/components/shop/ProductCard/ProductCard";
import { MatchHero } from "@/components/shop/MatchHero/MatchHero";
import { MatchGrid } from "@/components/shop/MatchGrid/MatchGrid";
import { SectionHeader } from "@/components/shop/SectionHeader/SectionHeader";
import { getActiveProducts } from "@/lib/products";
import { getSalesChannels, resolveRedirectUrl } from "@/lib/shop/sales-channels";
import { getShopGames } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import styles from "./home.module.css";

// Revalidated periodically rather than on every request - admin price/schedule
// changes (Phase 5) show up within a minute without hitting Supabase on every view.
export const revalidate = 60;

export default async function Home() {
  const [products, { now, upcoming: games, heroCandidates }, salesChannels] = await Promise.all([
    getActiveProducts(),
    getShopGames(CURRENT_SEASON),
    getSalesChannels(),
  ]);

  const seasonPasses = products.filter((product) => product.type === "season_pass");
  const memberships = products.filter((product) => product.type === "membership");
  const cheapestMembership = memberships[0];
  const upcomingGames = games.slice(0, 3);

  return (
    <div>
      <MatchHero games={heroCandidates} serverNow={now} />

      <section id="spiele" className={styles.section}>
        <Container>
          <SectionHeader
            title="Kommende Spiele"
            action={{ href: "/spielplan", label: "Alle ansehen" }}
            note="Einzeltickets gibt es über Eventfrog. Mit einer Saisonkarte oder Red-Castle-Club-Karte brauchst du kein zusätzliches Ticket."
          />
          {upcomingGames.length > 0 ? (
            <MatchGrid games={upcomingGames} />
          ) : (
            <p className={styles.emptyState}>
              Die Heimspiele der Saison {CURRENT_SEASON_LABEL} werden in Kürze
              veröffentlicht. Einzeltickets gibt es dann hier und über Eventfrog.
            </p>
          )}
        </Container>
      </section>

      <section id="saisonkarten" className={styles.section}>
        <Container>
          <SectionHeader
            title="Saisonkarten"
            note={`Ein Ticket für die ganze Saison ${CURRENT_SEASON_LABEL}: alle Heimspiele des UHC Uster, ohne Einzelkauf.`}
          />
          <div className={styles.cardGrid}>
            {seasonPasses.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                gameCount={games.length}
                redirectUrl={resolveRedirectUrl(product, salesChannels)}
              />
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
              <Button as="a" href="/red-castle-club" variant="secondary" shape="pill">
                Red Castle Club entdecken
              </Button>
            </div>
          </Container>
        </section>
      )}
    </div>
  );
}
