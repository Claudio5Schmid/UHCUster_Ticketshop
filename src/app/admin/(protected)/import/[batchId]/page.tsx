import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { getImportBatch, type ImportBatchDetail } from "@/lib/admin/order-import";
import { RollbackButton } from "./RollbackButton";
import styles from "../../admin.module.css";

export const metadata = { title: "Import - Admin" };

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

type BatchOrder = ImportBatchDetail["orders"][number];

export default async function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const batch = await getImportBatch(batchId);
  if (!batch) notFound();

  const scanned = batch.orders.filter((order) => order.scanned).length;
  const blockedReason = batch.rolledBackAt
    ? `Bereits zurückgerollt am ${dateFormatter.format(new Date(batch.rolledBackAt))}.`
    : batch.orders.length === 0
      ? "Dieser Batch enthält keine Bestellungen."
      : scanned > 0
        ? `${scanned} Bestellung(en) dieses Batches haben bereits gescannte Karten - ein Rollback ist nicht mehr möglich. Einzelne Bestellungen lassen sich stornieren.`
        : null;

  const columns: TableColumn<BatchOrder>[] = [
    {
      key: "order",
      header: "Bestellnummer",
      render: (order) => (
        <Link href={`/admin/orders/${order.orderNumber}`} className={styles.orderLink}>
          {order.orderNumber}
        </Link>
      ),
    },
    { key: "ref", header: "Externe Referenz", render: (order) => order.externalRef ?? "–" },
    { key: "customer", header: "Kunde", render: (order) => order.customerName },
    { key: "product", header: "Produkt", render: (order) => `${order.quantity}x ${order.productName}` },
    {
      key: "status",
      header: "Status",
      render: (order) => (
        <div className={styles.statusCell}>
          <Badge variant={order.status === "bezahlt" ? "success" : order.status === "storniert" ? "neutral" : "info"}>{order.status}</Badge>
          {order.scanned && <Badge variant="warning">gescannt</Badge>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <p className={styles.breadcrumb}>
        <Link href="/admin" className={styles.orderLink}>
          Bestellungen
        </Link>{" "}
        / Import
      </p>
      <div className={styles.header}>
        <h1>Import {batch.filename ?? batch.id.slice(0, 8)}</h1>
        {batch.rolledBackAt && <Badge variant="neutral">zurückgerollt</Badge>}
      </div>

      <div className={styles.detailGrid}>
        <dl className={styles.detailBlock}>
          <dt>Importiert am</dt>
          <dd>{dateFormatter.format(new Date(batch.createdAt))}</dd>
          <dt>Durch</dt>
          <dd>{batch.createdByEmail ?? "–"}</dd>
          <dt>Zeilen in der Datei</dt>
          <dd>{batch.rowCount}</dd>
          <dt>Bestellungen im Batch</dt>
          <dd>{batch.orders.length}</dd>
        </dl>
      </div>

      <RollbackButton batchId={batch.id} orderCount={batch.orders.length} blockedReason={blockedReason} />

      {batch.orders.length > 0 && <Table caption="Bestellungen des Imports" columns={columns} rows={batch.orders} getRowKey={(order) => order.id} />}
    </div>
  );
}
