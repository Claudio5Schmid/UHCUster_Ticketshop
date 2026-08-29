import Link from "next/link";
import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import {
  getNewOrderCount,
  getOrderStatusCounts,
  getOrders,
  type OrderListItem,
  type OrderStatus,
} from "@/lib/admin/orders";
import { formatRappenAsChf } from "@/lib/pricing";
import { OrderFilters } from "./OrderFilters";
import styles from "./admin.module.css";

export async function generateMetadata() {
  const newCount = await getNewOrderCount();
  return {
    title: newCount > 0 ? `(${newCount}) Bestellungen - Admin` : "Bestellungen - Admin",
  };
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  neu: "neu",
  rechnung_versendet: "Rechnung versendet",
  bezahlt: "bezahlt",
  storniert: "storniert",
};

/** Paid is the one genuinely "done" state, so it's the only green one. New orders are
 * the ones needing action (accent), invoiced is in-flight (info), cancelled is inert. */
function statusBadgeVariant(status: OrderStatus) {
  if (status === "bezahlt") return "success" as const;
  if (status === "neu") return "accent" as const;
  if (status === "rechnung_versendet") return "info" as const;
  return "neutral" as const;
}

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as OrderStatus | "alle" | undefined) ?? "neu";
  const search = params.search ?? "";

  const [counts, orders] = await Promise.all([getOrderStatusCounts(), getOrders({ status, search })]);

  const summaryTiles = [
    { key: "neu", label: "Neu", value: String(counts.neu), tone: counts.neu > 0 ? "accent" : "muted" },
    { key: "rechnung_versendet", label: "Rechnung versendet", value: String(counts.rechnung_versendet), tone: "info" },
    { key: "bezahlt", label: "Bezahlt", value: String(counts.bezahlt), tone: "success" },
    { key: "offen", label: "Offener Betrag", value: formatRappenAsChf(counts.offener_betrag_rappen), tone: "muted" },
  ] as const;

  const columns: TableColumn<OrderListItem>[] = [
    {
      key: "order_number",
      header: "Bestellnummer",
      render: (order) => (
        <Link href={`/admin/orders/${order.order_number}`} className={styles.orderLink}>
          {order.order_number}
        </Link>
      ),
    },
    { key: "customer_name", header: "Kunde", render: (order) => order.customer_name },
    {
      key: "created_at",
      header: "Datum",
      render: (order) => dateFormatter.format(new Date(order.created_at)),
    },
    {
      key: "status",
      header: "Status",
      render: (order) => (
        <div className={styles.statusCell}>
          <Badge variant={statusBadgeVariant(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          {order.refund_owed && <Badge variant="warning">Rückerstattung offen</Badge>}
        </div>
      ),
    },
    { key: "total", header: "Betrag", render: (order) => formatRappenAsChf(order.total_rappen) },
  ];

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

      <OrderFilters status={status} search={search} />

      {orders.length === 0 ? (
        <p className={styles.emptyState}>
          Keine Bestellungen für diese Auswahl. Andere Status wählen oder die Suche leeren.
        </p>
      ) : (
        <Table caption="Bestellungen" columns={columns} rows={orders} getRowKey={(order) => order.id} />
      )}
    </div>
  );
}
