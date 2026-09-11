import { getSalesChannels } from "@/lib/shop/sales-channels";
import { SalesChannelsClient } from "./SalesChannelsClient";
import styles from "../admin.module.css";

export const metadata = { title: "Verkauf - Admin" };

// The switch decides what every visitor sees, so this page must never be served
// from a cache that predates the last change.
export const dynamic = "force-dynamic";

export default async function SalesChannelsPage() {
  const channels = await getSalesChannels();

  // Stable order regardless of what the database returns, so the two rows never
  // swap places between visits.
  const order = ["season_pass", "membership"];
  const sorted = [...channels].sort((a, b) => order.indexOf(a.productType) - order.indexOf(b.productType));

  return (
    <div>
      <div className={styles.header}>
        <h1>Verkauf</h1>
      </div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)", maxWidth: "60ch" }}>
        Wo ein Angebot gekauft wird. Steht der Regler rechts, zeigt der Shop die Karten weiterhin an, der Knopf
        führt aber auf uhcuster.ch - es entsteht keine Bestellung, die von Hand verbucht werden müsste. Links läuft
        der Kauf über Warenkorb und Kasse dieses Shops.
      </p>
      <SalesChannelsClient channels={sorted} />
    </div>
  );
}
