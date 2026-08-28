import Image from "next/image";
import { Container } from "@/components/layout/Container/Container";
import { ProductCard } from "@/components/shop/ProductCard/ProductCard";
import { getActiveProducts } from "@/lib/products";
import { getUpcomingGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON, CURRENT_SEASON_LABEL } from "@/lib/season";
import styles from "../home.module.css";

export const metadata = {
  title: "Red Castle Club - UHC Uster Ticketshop",
};

export const revalidate = 60;

export default async function RedCastleClubPage() {
  const [products, games] = await Promise.all([
    getActiveProducts(),
    getUpcomingGamesForSeason(CURRENT_SEASON),
  ]);

  const memberships = products.filter((product) => product.type === "membership");

  return (
    <div>
      <section className={styles.hero}>
        <Container>
          <Image
            src="/red-castle-club-logo.png"
            alt="Red Castle Club"
            width={660}
            height={164}
            className={styles.heroLogo}
            priority
          />
          <span className={styles.heroEyebrow}>Saison {CURRENT_SEASON_LABEL}</span>
          <h1>Red Castle Club</h1>
          <p className={styles.heroLead}>
            Vier Stufen für alle, die den UHC Uster näher unterstützen wollen - von
            der persönlichen Saisonkarte bis zu übertragbaren VIP-Karten mit
            Gastro-Leistungen an den Heimspielen des L-UPL-Teams und Teilnahme am
            Netzwerk-Apéro.
          </p>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.cardGrid}>
            {memberships.map((product) => (
              <ProductCard key={product.id} product={product} gameCount={games.length} />
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
