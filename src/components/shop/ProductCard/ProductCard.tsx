import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { AddToCartButton } from "@/components/shop/AddToCartButton/AddToCartButton";
import { redirectButtonLabel, type ProductPurchase } from "@/lib/shop/sales-channels";
import type { Product } from "@/lib/products";
import { calculateSavings, formatRappenAsChf } from "@/lib/pricing";
import { getTicketAccentColor } from "@/lib/tier-colors";
import styles from "./ProductCard.module.css";

interface ProductCardProps {
  product: Product;
  /** Number of scheduled home games this season - drives the savings calculation. */
  gameCount: number;
  eyebrow?: string;
  /**
   * What this card's button does. The card itself is the same either way - price,
   * benefits and savings stay on display - because someone looking at the offer
   * still wants to know what it is, even where they cannot buy it here.
   */
  purchase?: ProductPurchase;
}

export function ProductCard({ product, gameCount, eyebrow, purchase = { kind: "cart" } }: ProductCardProps) {
  const highlights = product.benefits?.highlights ?? [];
  const savings = calculateSavings(product.price_rappen, product.benefits?.single_ticket_price_rappen, gameCount);
  const includedPasses = product.benefits?.included_passes ?? 1;
  const transferable = product.benefits?.transferable ?? false;
  const { accentHex, tintHex, metalName } = getTicketAccentColor(product.type, product.tier_level);

  return (
    <Card
      tier={product.tier_level}
      accentColor={metalName ? accentHex : undefined}
      tintColor={metalName ? tintHex : undefined}
      eyebrow={eyebrow ?? (product.type === "membership" ? "Red Castle Club" : "Saisonkarte")}
      title={product.name}
      footer={
        <>
          <div className={styles.priceBlock}>
            <span className={styles.price}>
              {product.price_rappen === 0 ? "Gratis" : formatRappenAsChf(product.price_rappen)}
            </span>
            {product.price_rappen > 0 && <span className={styles.priceSuffix}>/ Saison</span>}
          </div>
          <div className={styles.savings}>
            {savings && (
              <span className={styles.savingsValue}>du sparst {formatRappenAsChf(savings.savingsRappen)}</span>
            )}
          </div>
          {purchase.kind === "link" ? (
            // A new tab, and a label that names where it goes: leaving the shop
            // should be the visitor's decision, not a surprise, and their place
            // here is kept.
            <Button as="a" href={purchase.url} target="_blank" rel="noopener noreferrer" size="sm" fullWidth>
              {redirectButtonLabel(purchase.url)}
            </Button>
          ) : purchase.kind === "disabled" ? (
            <Button type="button" size="sm" fullWidth disabled>
              Auswählen
            </Button>
          ) : (
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              priceRappen={product.price_rappen}
              transferable={transferable}
              fullWidth
            />
          )}
        </>
      }
    >
      {product.description && <p style={{ marginBottom: highlights.length ? "var(--space-3)" : 0 }}>{product.description}</p>}
      {highlights.length > 0 && (
        <ul className={styles.highlights}>
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      )}
      {transferable && includedPasses > 1 && (
        <p className={styles.bundleNote}>
          Im Checkout hinterlegst du einen Namen (z.B. eure Firma) für alle {includedPasses} Karten.
        </p>
      )}
    </Card>
  );
}
