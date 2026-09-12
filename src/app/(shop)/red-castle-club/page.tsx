import Image from "next/image";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { ProductCard } from "@/components/shop/ProductCard/ProductCard";
import { HeroShell, HeroTitle } from "@/components/shop/HeroShell/HeroShell";
import { getActiveProducts } from "@/lib/products";
import { getSalesChannels, resolvePurchase } from "@/lib/shop/sales-channels";
import { getUpcomingGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import styles from "../home.module.css";

export const metadata = {
  title: "Red Castle Club - UHC Uster Ticketshop",
};

export const revalidate = 60;

export default async function RedCastleClubPage() {
  const [products, games, salesChannels] = await Promise.all([
    getActiveProducts(),
    getUpcomingGamesForSeason(CURRENT_SEASON),
    getSalesChannels(),
  ]);

  const memberships = products.filter((product) => product.type === "membership");

  return (
    <div>
      <HeroShell>
        <Image
          src="/red-castle-club-logo.png"
          alt=""
          width={660}
          height={164}
          className={styles.heroLogo}
          preload
        />
        <span className={styles.heroEyebrow}>Saison {CURRENT_SEASON_LABEL}</span>
        <HeroTitle>Red Castle Club</HeroTitle>
        <p className={styles.heroLead}>
          Vier Stufen für alle, die den UHC Uster näher unterstützen wollen - von
          der persönlichen Saisonkarte bis zu übertragbaren VIP-Karten mit
          Gastro-Leistungen an den Heimspielen des L-UPL-Teams und Teilnahme am
          Netzwerk-Apéro.
        </p>
        <div className={styles.heroActions}>
          <Button as="a" href="#mitgliedschaften" variant="accent" shape="pill">
            Mitglied werden
          </Button>
        </div>
      </HeroShell>

      <section id="mitgliedschaften" className={styles.section}>
        <Container>
          <div className={styles.cardGrid}>
            {memberships.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                gameCount={games.length}
                purchase={resolvePurchase(product, salesChannels)}
              />
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
