import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderDetail, getOrderEmails, type OrderEmail, type OrderHistoryEntry } from "@/lib/admin/orders";
import { getOrderTickets } from "@/lib/admin/tickets";
import { buildOrderAccessUrl } from "@/lib/orders/access-token";
import { formatRappenAsChf } from "@/lib/pricing";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/products";
import { EMAIL_STATES } from "@/lib/email/status-labels";
import { Badge } from "@/components/ui/Badge/Badge";
import { OrderActions } from "./OrderActions";
import { CustomerLinkButton } from "./CustomerLinkButton";
import { TicketsPanel } from "./TicketsPanel";
import { CopyField, CopyAllButton } from "./CopyField";
import styles from "../../admin.module.css";
import own from "./invoice.module.css";

const dateTime = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

const STATUS_LABELS = {
  neu: "neu",
  rechnung_versendet: "Rechnung versendet",
  bezahlt: "bezahlt",
  storniert: "storniert",
} as const;

const EMAIL_KINDS: Record<OrderEmail["kind"], string> = {
  order_confirmation: "Bestellbestätigung",
  order_notification: "Meldung ans Büro",
  order_info: "Kundeninfo",
  member_cards: "Mitgliederkarten",
  test: "Testmail",
};

const ACTION_LABELS: Record<string, string> = {
  status_change: "Status",
  invoice_number_change: "Rechnungsnummer",
  refund_owed_change: "Rückerstattung offen",
  files_handed_over_change: "Dateien übergeben",
  holder_name_change: "Name",
  notification: "Kundeninfo",
  import_order_created: "Importiert",
  member_order_created: "Erstellt (Mitglied)",
  import_rolled_back: "Import zurückgerollt",
};

function describeHistory(entry: OrderHistoryEntry): string {
  const label = ACTION_LABELS[entry.action] ?? entry.action;
  if (entry.action === "status_change") return `${label}: ${entry.old_value ?? "–"} → ${entry.new_value ?? "–"}`;
  if (entry.new_value !== null || entry.old_value !== null) return `${label}: ${entry.old_value ?? "–"} → ${entry.new_value ?? "–"}`;
  return entry.note ? `${label} (${entry.note})` : label;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await getOrderDetail(orderNumber);
  if (!order) notFound();

  const [tickets, emails] = await Promise.all([getOrderTickets(order.id), getOrderEmails(order.id)]);
  const liveTickets = tickets.filter((ticket) => ticket.status === "gueltig" || ticket.status === "eingeloest").length;

  const person = [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ");
  const address = [order.customer.address_street, [order.customer.address_zip, order.customer.address_city].filter(Boolean).join(" ")]
    .filter((line) => line && line.trim())
    .join("\n");
  const positions = order.items
    .map((item) => `${item.quantity}x ${item.product_name_snapshot}${item.holder_name ? ` (${item.holder_name})` : ""}: ${formatRappenAsChf(item.line_total_rappen)}`)
    .join("\n");
  const category = order.items[0]?.category ?? null;

  const invoiceBlock = [
    order.customer.name,
    order.customer.company_name && person ? person : null,
    address,
    "",
    `E-Mail: ${order.customer.email}`,
    order.customer.phone ? `Telefon: ${order.customer.phone}` : null,
    order.customer.customer_reference ? `Referenz: ${order.customer.customer_reference}` : null,
    "",
    positions,
    `Total: ${formatRappenAsChf(order.total_rappen)}`,
    `Bestellnummer: ${order.order_number}`,
    "Zahlungsfrist: 30 Tage netto",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return (
    <div>
      <p className={styles.breadcrumb}>
        <Link href="/admin" className={styles.orderLink}>
          Bestellungen
        </Link>{" "}
        / {order.order_number}
      </p>
      <div className={styles.header}>
        <h1>{order.order_number}</h1>
        <div className={styles.statusCell}>
          <Badge variant={order.status === "bezahlt" ? "success" : order.status === "neu" ? "accent" : order.status === "rechnung_versendet" ? "info" : "neutral"}>
            {STATUS_LABELS[order.status]}
          </Badge>
          <Badge variant={order.source === "shop" ? "info" : "outline"}>{order.source === "shop" ? "Shop" : "Import"}</Badge>
          {order.refund_owed && <Badge variant="warning">Rückerstattung offen</Badge>}
        </div>
      </div>

      <OrderActions
        orderId={order.id}
        orderNumber={order.order_number}
        status={order.status}
        refundOwed={order.refund_owed}
        invoiceNumber={order.invoice_number}
        liveTickets={liveTickets}
        hasTickets={tickets.length > 0}
      />

      <CustomerLinkButton url={buildOrderAccessUrl(order.order_number)} />

      {/* The invoice data, field by field with a copy button each (brief §2.5). */}
      <section className={own.panel} aria-labelledby="rechnungsdaten">
        <div className={own.panelHead}>
          <h2 id="rechnungsdaten">Rechnungsdaten</h2>
          <CopyAllButton text={invoiceBlock} label="Alles kopieren" />
        </div>
        <div className={own.grid}>
          <div>
            <CopyField label="Rechnungsadresse (Name)" value={order.customer.name} />
            {order.customer.company_name && <CopyField label="Kontaktperson" value={person} />}
            <CopyField label="Adresse" value={address} multiline />
            <CopyField label="E-Mail" value={order.customer.email} editableAs={{ kind: "order", id: order.id }} />
            <CopyField label="Telefon" value={order.customer.phone} />
            <CopyField label="Referenz / PO-Nummer" value={order.customer.customer_reference} />
          </div>
          <div>
            <CopyField label="Bestellnummer (Referenz auf der Rechnung)" value={order.order_number} />
            <CopyField label="Positionen" value={positions} multiline />
            <CopyField label="Betrag" value={formatRappenAsChf(order.total_rappen)} />
            <CopyField label="Zahlungsfrist" value="30 Tage netto" />
            <CopyField label="Rechnungsnummer (Fibu)" value={order.invoice_number} />
            <CopyField label="Externe Referenz (Altsystem)" value={order.external_ref} />
          </div>
        </div>
      </section>

      <div className={styles.detailGrid}>
        <dl className={styles.detailBlock}>
          <dt>Produkt</dt>
          <dd>
            {category ? PRODUCT_CATEGORY_LABELS[category] : "–"}
            {order.items[0]?.variant ? ` · ${order.items[0].variant}` : ""}
          </dd>
          <dt>Bestelldatum</dt>
          <dd>{dateTime.format(new Date(order.created_at))}</dd>
          <dt>Zahlungsart</dt>
          <dd>Rechnung{order.terms_accepted_at ? `, Bedingungen akzeptiert ${dateTime.format(new Date(order.terms_accepted_at))}` : ""}</dd>
          {order.import_batch_id && (
            <>
              <dt>Import</dt>
              <dd>
                <Link href={`/admin/import/${order.import_batch_id}`} className={styles.orderLink}>
                  Zum Import-Batch
                </Link>
              </dd>
            </>
          )}
        </dl>

        <dl className={styles.detailBlock}>
          <dt>Bestellbestätigung</dt>
          <dd>
            {order.confirmation_email_sent_at ? (
              <Badge variant="success">Versendet {dateTime.format(new Date(order.confirmation_email_sent_at))}</Badge>
            ) : order.source === "shop" ? (
              <Badge variant="warning">Nicht versendet</Badge>
            ) : (
              <Badge variant="neutral">Import - keine automatische Mail</Badge>
            )}
          </dd>
          <dt>Kundeninfo (manuell)</dt>
          <dd>
            {order.notification_status === "versendet" ? (
              <Badge variant="success">Informiert{order.notified_at ? ` ${dateTime.format(new Date(order.notified_at))}` : ""}</Badge>
            ) : order.notification_status === "fehlgeschlagen" ? (
              <Badge variant="warning">Fehlgeschlagen{order.notification_error ? `: ${order.notification_error}` : ""}</Badge>
            ) : (
              <Badge variant="neutral">Nicht informiert</Badge>
            )}
          </dd>
          <dt>Rückerstattung ausstehend</dt>
          <dd>{order.refund_owed ? "Ja" : "Nein"}</dd>
        </dl>
      </div>

      <TicketsPanel orderNumber={order.order_number} tickets={tickets} />

      {emails.length > 0 && (
        <section className={styles.section} aria-labelledby="emails">
          <div className={styles.header}>
            <h2 id="emails">E-Mails</h2>
          </div>
          <ul className={own.history}>
            {emails.map((email) => {
              const state = EMAIL_STATES[email.status];
              return (
                <li key={email.id} className={own.historyRow}>
                  <span className={own.historyWhen}>{dateTime.format(new Date(email.sentAt))}</span>
                  <span>
                    <Badge variant={state.variant}>{state.label}</Badge> {EMAIL_KINDS[email.kind]} an {email.recipient}
                    {email.cardCount > 0 ? ` · ${email.cardCount} Karte(n) angehängt` : ""}
                    {email.statusDetail ? <span className={own.historyWho}> · {email.statusDetail}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {order.history.length > 0 && (
        <section className={styles.section} aria-labelledby="verlauf">
          <div className={styles.header}>
            <h2 id="verlauf">Verlauf</h2>
          </div>
          <ul className={own.history}>
            {order.history.map((entry) => (
              <li key={entry.id} className={own.historyRow}>
                <span className={own.historyWhen}>{dateTime.format(new Date(entry.created_at))}</span>
                <span>
                  {describeHistory(entry)}{" "}
                  <span className={own.historyWho}>· {entry.actor_type === "system" ? "System" : (entry.actor_email ?? "Admin")}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
