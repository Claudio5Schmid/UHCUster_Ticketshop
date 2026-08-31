import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { verifyOrderAccessToken } from "@/lib/orders/access-token";
import { getCustomerOrderView, type CustomerOrderView } from "@/lib/orders/customer-view";
import { formatRappenAsChf } from "@/lib/pricing";
import styles from "../meine-tickets.module.css";

export const metadata: Metadata = {
  title: "Meine Tickets - UHC Uster Ticketshop",
  // A signed link is a bearer credential: it must never end up in a search index
  // or a referrer-driven crawl.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Never prerendered, never cached: the whole point of this page is that it shows
// the status the office set a minute ago.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "long" });

const STEPS = [
  { key: "eingegangen", label: "Bestellung eingegangen" },
  { key: "rechnung", label: "Rechnung versendet" },
  { key: "bezahlt", label: "Bezahlt - Karten bereit" },
] as const;

function currentStepIndex(status: CustomerOrderView["status"]): number {
  if (status === "bezahlt") return 2;
  if (status === "rechnung_versendet") return 1;
  return 0;
}

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const orderNumber = verifyOrderAccessToken(token);
  if (!orderNumber) notFound();

  const order = await getCustomerOrderView(orderNumber);
  if (!order) notFound();

  const stepIndex = currentStepIndex(order.status);
  const cancelled = order.status === "storniert";

  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}>Bestellung</span>
          <h1 className={styles.orderNumber}>{order.orderNumber}</h1>
          <p className={styles.lead}>
            {order.customerName ? `${order.customerName}, ` : ""}bestellt am{" "}
            {dateFormatter.format(new Date(order.createdAt))}.
          </p>

          {cancelled ? (
            <div className={`${styles.panel} ${styles.panelAccent}`} style={{ marginTop: "var(--space-6)" }}>
              <h2 className={styles.panelTitle}>
                Diese Bestellung wurde storniert <Badge variant="neutral">storniert</Badge>
              </h2>
              <p className={styles.panelText}>
                Falls das nicht stimmt oder du dazu eine Frage hast, melde dich beim Büro des UHC Uster.
              </p>
            </div>
          ) : (
            <ol className={styles.steps}>
              {STEPS.map((step, index) => (
                <li
                  key={step.key}
                  className={[
                    styles.step,
                    index < stepIndex ? styles.stepDone : "",
                    index === stepIndex ? styles.stepCurrent : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={index === stepIndex ? "step" : undefined}
                >
                  <span className={styles.stepLabel}>{step.label}</span>
                  {index === stepIndex && <span className={styles.stepMeta}>Aktueller Stand</span>}
                </li>
              ))}
            </ol>
          )}

          {!cancelled && <NextStep status={order.status} orderNumber={order.orderNumber} />}

          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Deine Bestellung</h2>
            {order.items.map((item) => (
              <div key={item.id} className={styles.line}>
                <span>
                  {item.quantity > 1 ? `${item.quantity}x ` : ""}
                  {item.productName}
                  {item.holderName ? ` - ${item.holderName}` : ""}
                </span>
                <span>{formatRappenAsChf(item.lineTotalRappen)}</span>
              </div>
            ))}
            <div className={styles.total}>
              <span>Total</span>
              <span>{formatRappenAsChf(order.totalRappen)}</span>
            </div>
          </div>

          {order.tickets.length > 0 && (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>Deine Karten</h2>
              {order.tickets.map((ticket) => (
                <div key={ticket.id} className={styles.ticketRow}>
                  <span>
                    <span className={styles.ticketName}>{ticket.productName}</span>
                    <span className={styles.ticketMeta}>{ticket.holderName ?? "Ohne Namen"}</span>
                  </span>
                  <Button as="a" href={`/meine-tickets/${token}/tickets/${ticket.id}`} variant="secondary" size="sm">
                    PDF herunterladen
                  </Button>
                </div>
              ))}
              {order.tickets.length > 1 && (
                <div className={styles.ticketActions}>
                  <Button as="a" href={`/meine-tickets/${token}/tickets-zip`} variant="secondary">
                    Alle Karten als ZIP
                  </Button>
                </div>
              )}
            </div>
          )}

          <p className={styles.footnote}>
            Speichere dir diese Seite als Lesezeichen - über diesen Link kommst du jederzeit zu deiner
            Bestellung und deinen Karten zurück. Behandle ihn wie ein Ticket und teile ihn nicht öffentlich.
          </p>
        </div>
      </Container>
    </div>
  );
}

/** The one thing a customer actually wants from this page: what happens next, and
 * whether they need to do anything right now. */
function NextStep({ status, orderNumber }: { status: CustomerOrderView["status"]; orderNumber: string }) {
  if (status === "bezahlt") {
    return (
      <div className={`${styles.panel} ${styles.panelAccent}`}>
        <h2 className={styles.panelTitle}>Zahlung eingegangen</h2>
        <p className={styles.panelText}>
          Deine Karten stehen unten zum Download bereit. Zeig den QR-Code am Eingang direkt auf dem Handy
          oder ausgedruckt vor.
        </p>
      </div>
    );
  }

  if (status === "rechnung_versendet") {
    return (
      <div className={`${styles.panel} ${styles.panelAccent}`}>
        <h2 className={styles.panelTitle}>Rechnung ist unterwegs</h2>
        <p className={styles.panelText}>
          Bitte überweise den Betrag mit der Bestellnummer <strong>{orderNumber}</strong> als Referenz.
          Sobald die Zahlung eingegangen ist, erscheinen deine Karten hier zum Download.
        </p>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} ${styles.panelAccent}`}>
      <h2 className={styles.panelTitle}>Wir haben deine Bestellung</h2>
      <p className={styles.panelText}>
        Das Büro des UHC Uster sendet dir die Rechnung innerhalb weniger Werktage per E-Mail. Bitte
        überweise noch nichts, bevor du sie erhalten hast. Danach erscheinen deine Karten hier zum
        Download.
      </p>
    </div>
  );
}
