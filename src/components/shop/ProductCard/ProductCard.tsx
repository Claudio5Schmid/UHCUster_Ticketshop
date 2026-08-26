import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import type { Product } from "@/lib/products";
import { calculateSavings, formatRappenAsChf } from "@/lib/pricing";
import styles from "./ProductCard.module.css";

interface ProductCardProps {
  product: Product;
  /** Number of scheduled home games this season - drives the savings calculation. */
  gameCount: number;
  eyebrow?: string;
}

export function ProductCard({ product, gameCount, eyebrow }: ProductCardProps) {
  const highlights = product.benefits?.highlights ?? [];
  const savings = calculateSavings(product.price_rappen, product.benefits?.single_ticket_price_rappen, gameCount);

  return (
    <Card
      tier={product.tier_level}
      eyebrow={eyebrow ?? (product.type === "membership" ? "Red Castle Club" : "Saisonkarte")}
      title={product.name}
      footer={
        <>
          <div className={styles.priceBlock}>
            <span className={styles.price}>
              {product.price_rappen === 0 ? "Gratis" : formatRappenAsChf(product.price_rappen)}
              {product.price_rappen > 0 && <span className={styles.priceSuffix}> / Saison</span>}
            </span>
            {savings && (
              <span className={styles.savings}>
                Einzeleintritte wären {formatRappenAsChf(savings.equivalentValueRappen)} wert -{" "}
                <span className={styles.savingsValue}>du sparst {formatRappenAsChf(savings.savingsRappen)}</span>
              </span>
            )}
          </div>
          <Button size="sm">Auswählen</Button>
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
    </Card>
  );
}
