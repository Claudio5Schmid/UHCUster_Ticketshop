import { notFound } from "next/navigation";
import { getOrderDetail } from "@/lib/admin/orders";
import { getOrderTickets } from "@/lib/admin/tickets";
import { getMemberCardsSentAtForOrder } from "@/lib/admin/members";
import { buildOrderAccessUrl } from "@/lib/orders/access-token";
import { formatRappenAsChf } from "@/lib/pricing";
import { Badge } from "@/components/ui/Badge/Badge";
import { OrderActions } from "./OrderActions";
import { CustomerLinkButton } from "./CustomerLinkButton";
import { TicketsPanel } from "./TicketsPanel";
import styles from "../../admin.module.css";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await getOrderDetail(orderNumber);

  if (!order) {
    notFound();
  }

  const [tickets, cardsSentAt] = await Promise.all([getOrderTickets(order.id), getMemberCardsSentAtForOrder(order.id)]);

  return (
    <div>
      <div className={styles.header}>
        <h1>{order.order_number}</h1>
        <Badge variant={order.status === "bezahlt" ? "accent" : "neutral"}>{order.status}</Badge>
      </div>

      <OrderActions orderId={order.id} orderNumber={order.order_number} status={order.status} refundOwed={order.refund_owed} />

      <CustomerLinkButton url={buildOrderAccessUrl(order.order_number)} />

      <div className={styles.detailGrid}>
        <dl className={styles.detailBlock}>
          <dt>Name</dt>
          <dd>{order.customer.name}</dd>
          <dt>Adresse</dt>
          <dd>
            {order.customer.address_street}
            <br />
            {order.customer.address_zip} {order.customer.address_city}
          </dd>
          <dt>E-Mail</dt>
          <dd>{order.customer.email}</dd>
          <dt>Telefon</dt>
          <dd>{order.customer.phone}</dd>
        </dl>

        <dl className={styles.detailBlock}>
          <dt>Bestelldatum</dt>
          <dd>
            {new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(
              new Date(order.created_at)
            )}
          </dd>
          <dt>Total</dt>
          <dd>{formatRappenAsChf(order.total_rappen)}</dd>
          <dt>Rückerstattung ausstehend</dt>
          <dd>{order.refund_owed ? "Ja" : "Nein"}</dd>
          {/* Answers "der Kunde sagt, er habe nichts bekommen" without digging through logs. */}
          <dt>Bestellbestätigung</dt>
          <dd>
            {order.confirmation_email_sent_at ? (
              <Badge variant="success">
                Versendet{" "}
                {new Intl.DateTimeFormat("de-CH", {
                  timeZone: "Europe/Zurich",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(order.confirmation_email_sent_at))}
              </Badge>
            ) : (
              <Badge variant="warning">Nicht versendet</Badge>
            )}
          </dd>
        </dl>
      </div>

      <h2>Positionen</h2>
      <div className={styles.copyBlock}>
        {order.items.map((item) => (
          <div key={item.id}>
            {item.quantity}x {item.product_name_snapshot}
            {item.holder_name ? ` - ${item.holder_name}` : ""} -{" "}
            {formatRappenAsChf(item.line_total_rappen)}
          </div>
        ))}
      </div>

      <TicketsPanel
        orderId={order.id}
        orderNumber={order.order_number}
        tickets={tickets}
        filesHandedOverAt={order.files_handed_over_at}
        cardsSentAt={cardsSentAt}
      />
    </div>
  );
}
