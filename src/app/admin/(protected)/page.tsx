import Link from "next/link";
import { Select } from "@/components/ui/Select/Select";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { getNewOrderCount, getOrders, type OrderListItem, type OrderStatus } from "@/lib/admin/orders";
import { formatRappenAsChf } from "@/lib/pricing";
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

function statusBadgeVariant(status: OrderStatus) {
  if (status === "bezahlt") return "accent" as const;
  if (status === "storniert") return "outline" as const;
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

  const [newCount, orders] = await Promise.all([getNewOrderCount(), getOrders({ status, search })]);

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
        <>
          <Badge variant={statusBadgeVariant(order.status)}>{STATUS_LABELS[order.status]}</Badge>
          {order.refund_owed && (
            <span style={{ marginLeft: "var(--space-2)" }}>
              <Badge variant="outline">Rückerstattung offen</Badge>
            </span>
          )}
        </>
      ),
    },
    { key: "total", header: "Betrag", render: (order) => formatRappenAsChf(order.total_rappen) },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Bestellungen</h1>
        {newCount > 0 && <span className={styles.newCount}>{newCount} neu</span>}
      </div>

      <form className={styles.filters} method="get">
        <Select name="status" label="Status" defaultValue={status}>
          <option value="neu">Neu</option>
          <option value="rechnung_versendet">Rechnung versendet</option>
          <option value="bezahlt">Bezahlt</option>
          <option value="storniert">Storniert</option>
          <option value="alle">Alle</option>
        </Select>
        <div className={styles.searchField}>
          <Input name="search" label="Suche" placeholder="Name oder Bestellnummer" defaultValue={search} />
        </div>
        <Button type="submit" variant="secondary">
          Filtern
        </Button>
      </form>

      <Table caption="Bestellungen" columns={columns} rows={orders} getRowKey={(order) => order.id} />
    </div>
  );
}
