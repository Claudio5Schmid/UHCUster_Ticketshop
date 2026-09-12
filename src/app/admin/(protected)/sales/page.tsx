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
        Wo ein Angebot gekauft wird. Die Karten bleiben in allen drei Fällen mit Preis und Vorteilen stehen - es
        ändert sich nur, was der Knopf darunter tut. Solange der Shop kein Geld entgegennehmen kann, wäre jede
        Bestellung hier eine, die von Hand verbucht werden müsste.
      </p>
      <SalesChannelsClient channels={sorted} />
    </div>
  );
}
