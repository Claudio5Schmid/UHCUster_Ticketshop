import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { getActiveProductByVariant } from "@/lib/products";
import { getSalesChannels, resolvePurchase } from "@/lib/shop/sales-channels";
import { RedCastleOrderForm } from "./RedCastleOrderForm";
import styles from "./bestellen.module.css";

export const metadata: Metadata = {
  title: "Red Castle Club bestellen - UHC Uster Ticketshop",
  robots: { index: false, follow: false },
};

// Prices and the sales switch are read fresh on every request - a form that
// showed yesterday's price would write today's into the order.
export const dynamic = "force-dynamic";

export default async function RedCastleOrderPage({ searchParams }: { searchParams: Promise<{ variante?: string }> }) {
  const { variante } = await searchParams;
  const variant = (variante ?? "").toLowerCase();

  const [product, channels] = await Promise.all([
    variant ? getActiveProductByVariant("red_castle", variant) : Promise.resolve(null),
    getSalesChannels(),
  ]);

  if (!product || resolvePurchase(product, channels).kind !== "cart") {
    return (
      <div className={styles.page}>
        <Container>
          <h1>Red Castle Club</h1>
          <div className={styles.notice}>
            <p style={{ margin: 0 }}>
              {product
                ? "Der Red Castle Club wird zurzeit nicht über den Ticketshop bestellt."
                : "Dieses Paket gibt es nicht oder es ist zurzeit nicht bestellbar."}{" "}
              <Link href="/red-castle-club">Zurück zur Übersicht</Link>.
            </p>
          </div>
        </Container>
      </div>
    );
  }

  return <RedCastleOrderForm product={product} />;
}
