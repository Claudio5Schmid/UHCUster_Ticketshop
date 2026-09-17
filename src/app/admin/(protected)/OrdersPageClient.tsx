"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { SendMailDialog, type SendSummary } from "@/components/admin/SendMailDialog/SendMailDialog";
import { ORDER_PLACEHOLDERS, ORDER_TEMPLATES } from "@/lib/email/templates";
import { MAX_RECIPIENTS_PER_RUN } from "@/lib/admin/send-confirmation";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/products";
import { formatRappenAsChf } from "@/lib/pricing";
import type { OrderListItem, OrderStatus, NotificationStatus } from "@/lib/admin/orders";
import { EMAIL_STATES, type StatusTone } from "@/lib/email/status-labels";
import { OrderImportDialog } from "./OrderImportDialog";
import { previewOrderMailAction, sendOrderMailsAction, sendOrderTestMailAction } from "./notify-actions";
import styles from "./admin.module.css";

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

const NOTIFIED: Record<NotificationStatus, { label: string; variant: StatusTone }> = {
  nicht_versendet: { label: "Nicht informiert", variant: "neutral" },
  versendet: { label: "Versendet", variant: "info" },
  fehlgeschlagen: { label: "Fehlgeschlagen", variant: "warning" },
};

/**
 * What the provider said about the newest mail to this customer.
 *
 * A resend gets a new id every time and outcomes come back late, so the newest
 * send is the only one that still describes where the customer stands - the
 * same rule the database follows when it writes the order's status.
 *
 * An order whose mails predate the mail log has nothing to read, so it falls
 * back to what the send itself recorded at the time.
 */
function deliveryBadge(order: OrderListItem) {
  return order.delivery_status ? EMAIL_STATES[order.delivery_status] : NOTIFIED[order.notification_status];
}

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** One round trip per block. The server sends four at a time inside it, so a
 *  block of twenty is a few seconds of work and the bar still moves often. */
const SEND_CHUNK = 20;

interface OrdersPageClientProps {
  orders: OrderListItem[];
  filterBar: ReactNode;
  invoiceCsvHref: string;
  adminEmail: string;
}

export function OrdersPageClient({ orders, filterBar, invoiceCsvHref, adminEmail }: OrdersPageClientProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSend, setShowSend] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "warning" | "error" } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selected = orders.filter((order) => selectedIds.has(order.id));
  // What a send would actually reach: live cards, not cancelled, not yet informed.
  const sendable = selected.filter((order) => order.status !== "storniert" && order.live_tickets > 0);
  const notYetNotified = sendable.filter((order) => order.notification_status !== "versendet");
  const alreadyNotified = sendable.filter((order) => order.notification_status === "versendet");
  const empty = selected.length - sendable.length;

  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.has(order.id));
  const someSelected = orders.some((order) => selectedIds.has(order.id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) orders.forEach((order) => next.delete(order.id));
      else orders.forEach((order) => next.add(order.id));
      return next;
    });
  }

  async function runSend(
    subject: string,
    body: string,
    phrase: string,
    options: { includeAlreadyNotified: boolean },
    onProgress: (done: number, total: number) => void
  ): Promise<SendSummary> {
    // One block per run, the rest on the next click (see MAX_RECIPIENTS_PER_RUN).
    const ids = (options.includeAlreadyNotified ? sendable : notYetNotified).map((order) => order.id).slice(0, MAX_RECIPIENTS_PER_RUN);
    const summary: SendSummary = { sent: 0, skipped: [], failed: [] };
    onProgress(0, ids.length);
    for (let offset = 0; offset < ids.length; offset += SEND_CHUNK) {
      const chunk = await sendOrderMailsAction(subject, body, phrase, ids.slice(offset, offset + SEND_CHUNK), options);
      summary.sent += chunk.sent;
      summary.skipped.push(...chunk.skipped.map((s) => ({ label: s.orderNumber, reason: s.reason })));
      summary.failed.push(...chunk.failed.map((f) => ({ label: `${f.orderNumber} (${f.email})`, reason: f.reason })));
      onProgress(Math.min(offset + SEND_CHUNK, ids.length), ids.length);
    }
    return summary;
  }

  function handleDone(summary: SendSummary) {
    const failures = summary.failed.length;
    setMessage({
      tone: failures === 0 ? "success" : summary.sent === 0 ? "error" : "warning",
      text:
        `${summary.sent} E-Mail(s) versendet.` +
        (summary.skipped.length > 0 ? ` ${summary.skipped.length} übersprungen.` : "") +
        (failures > 0 ? ` ${failures} fehlgeschlagen: ${summary.failed.map((f) => `${f.label}: ${f.reason}`).join("; ")}` : ""),
    });
    setShowSend(false);
    setSelectedIds(new Set());
  }

  const columns: TableColumn<OrderListItem>[] = [
    {
      key: "select",
      header: <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Alle auswählen" />,
      render: (order) => (
        <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggle(order.id)} aria-label={`${order.order_number} auswählen`} />
      ),
    },
    {
      key: "order_number",
      header: "Bestellnummer",
      render: (order) => (
        <Link href={`/admin/orders/${order.order_number}`} className={styles.orderLink}>
          {order.order_number}
        </Link>
      ),
    },
    {
      key: "customer_name",
      header: "Kunde",
      render: (order) => (
        <Link href={`/admin/orders/${order.order_number}`} className={styles.orderLink}>
          {order.customer_name}
          {order.company_name && (order.first_name || order.last_name) && (
            <span style={{ display: "block", color: "var(--color-text-secondary)", fontWeight: 400 }}>
              {[order.first_name, order.last_name].filter(Boolean).join(" ")}
            </span>
          )}
        </Link>
      ),
    },
    {
      key: "product",
      header: "Produkt",
      render: (order) => (
        <>
          {order.category ? PRODUCT_CATEGORY_LABELS[order.category] : order.product_name}
          {order.variant_label && <span style={{ color: "var(--color-text-secondary)" }}> {order.variant_label}</span>}
          <span style={{ color: "var(--color-text-secondary)" }}> · {order.quantity} Karte(n)</span>
        </>
      ),
    },
    {
      key: "source",
      header: "Quelle",
      render: (order) => <Badge variant={order.source === "shop" ? "info" : "outline"}>{order.source === "shop" ? "Shop" : "Import"}</Badge>,
    },
    { key: "created_at", header: "Datum", render: (order) => dateFormatter.format(new Date(order.created_at)) },
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
    {
      key: "notified",
      header: "Zustellung",
      render: (order) => {
        const badge = deliveryBadge(order);
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
    { key: "total", header: "Betrag", render: (order) => formatRappenAsChf(order.total_rappen) },
  ];

  return (
    <div>
      {filterBar}

      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowImport(true)}>
            CSV importieren
          </Button>
          <Button as="a" href={invoiceCsvHref} variant="secondary" size="sm">
            Rechnungsdaten als CSV
          </Button>
        </div>
      </div>

      {message && (
        <p className={message.tone === "success" ? styles.successMessage : message.tone === "warning" ? styles.warningMessage : styles.errorMessage}>
          {message.text}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className={styles.selectionBar}>
          <span>
            <strong>{selectedIds.size}</strong> ausgewählt
          </span>
          <Button type="button" size="sm" disabled={sendable.length === 0} onClick={() => setShowSend(true)}>
            E-Mail versenden…
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
            Auswahl aufheben
          </Button>
        </div>
      )}

      {orders.length === 0 ? (
        <p className={styles.emptyState}>Keine Bestellungen für diese Auswahl. Andere Filter wählen oder die Suche leeren.</p>
      ) : (
        <Table caption="Bestellungen" columns={columns} rows={orders} getRowKey={(order) => order.id} />
      )}

      <SendMailDialog
        open={showSend}
        onClose={() => setShowSend(false)}
        title="E-Mail an Bestellungen versenden"
        recipientNoun={{ one: "Bestellung", many: "Bestellungen" }}
        recipientCount={notYetNotified.length}
        alreadyNotifiedCount={alreadyNotified.length}
        emptyCount={empty}
        previewCandidates={sendable.map((order) => ({ id: order.id, label: `${order.order_number} – ${order.customer_name}` }))}
        templates={ORDER_TEMPLATES}
        placeholders={ORDER_PLACEHOLDERS}
        defaultTestAddress={adminEmail}
        onPreview={previewOrderMailAction}
        onSendTest={sendOrderTestMailAction}
        onSend={runSend}
        onDone={handleDone}
      />

      <OrderImportDialog open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
