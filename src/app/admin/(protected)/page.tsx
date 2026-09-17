import { getNewOrderCount, getOrderStatusCounts, getOrders, getVariantOptions } from "@/lib/admin/orders";
import { parseOrderFilters, type OrderSearchParams } from "@/lib/admin/order-filters";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { formatRappenAsChf } from "@/lib/pricing";
import { OrderFilters } from "./OrderFilters";
import { OrdersPageClient } from "./OrdersPageClient";
import styles from "./admin.module.css";

export async function generateMetadata() {
  const newCount = await getNewOrderCount();
  return {
    title: newCount > 0 ? `(${newCount}) Bestellungen - Admin` : "Bestellungen - Admin",
  };
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<OrderSearchParams> }) {
  const params = await searchParams;
  const filters = parseOrderFilters(params);

  const supabase = await getSupabaseServerClient();
  const [counts, orders, variants, { data: auth }] = await Promise.all([
    getOrderStatusCounts(),
    getOrders(filters),
    getVariantOptions(),
    supabase.auth.getUser(),
  ]);

  const summaryTiles = [
    { key: "neu", label: "Neu", value: String(counts.neu), tone: counts.neu > 0 ? "accent" : "muted" },
    { key: "rechnung_versendet", label: "Rechnung versendet", value: String(counts.rechnung_versendet), tone: "info" },
    { key: "bezahlt", label: "Bezahlt", value: String(counts.bezahlt), tone: "success" },
    { key: "offen", label: "Offener Betrag", value: formatRappenAsChf(counts.offener_betrag_rappen), tone: "muted" },
  ] as const;

  // The export takes the list as it stands on screen.
  const exportParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) exportParams.set(key, value);
  if (!exportParams.has("status")) exportParams.set("status", "neu");

  return (
    <div>
      <div className={styles.header}>
        <h1>Bestellungen</h1>
        {counts.neu > 0 && <span className={styles.newCount}>{counts.neu} neu</span>}
      </div>

      <div className={styles.summaryGrid}>
        {summaryTiles.map((tile) => (
          <div key={tile.key} className={styles.summaryTile} data-tone={tile.tone}>
            <span className={styles.summaryValue}>{tile.value}</span>
            <span className={styles.summaryLabel}>{tile.label}</span>
          </div>
        ))}
      </div>

      <OrdersPageClient
        orders={orders}
        adminEmail={auth.user?.email ?? ""}
        invoiceCsvHref={`/admin/export/invoices?${exportParams.toString()}`}
        filterBar={
          <OrderFilters
            status={filters.status ?? "neu"}
            search={filters.search ?? ""}
            source={params.source ?? ""}
            category={params.category ?? ""}
            variant={params.variant ?? ""}
            notified={params.notified ?? ""}
            variants={variants}
          />
        }
      />
    </div>
  );
}
