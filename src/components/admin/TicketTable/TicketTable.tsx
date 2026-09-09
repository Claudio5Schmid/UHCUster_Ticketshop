"use client";

import { useState, useTransition } from "react";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Modal } from "@/components/ui/Modal/Modal";
import { ticketTypeLabel } from "@/lib/tickets/label";
import type { OrderTicket } from "@/lib/admin/tickets";
import {
  renameTicketHolderAction,
  deactivateTicketAction,
  regenerateTicketAction,
  type TicketActionTarget,
} from "@/app/admin/(protected)/ticket-actions";
import styles from "./TicketTable.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium" });

/**
 * One card per row, the same on a member's page and on an order. What each
 * status means for the person at the door:
 *
 *  - gueltig / eingeloest: the QR code works. "eingeloest" is currently never
 *    written by anything, but it is part of the ticket's own vocabulary.
 *  - storniert: deactivated by an admin, refused at the door, final.
 *  - ersetzt: this code was replaced after a loss. Kept visible so the history
 *    of a running number is legible rather than silently rewritten.
 */
const QR_STATE: Record<OrderTicket["status"], { label: string; variant: "success" | "neutral" | "warning" }> = {
  gueltig: { label: "Aktiv", variant: "success" },
  eingeloest: { label: "Aktiv", variant: "success" },
  storniert: { label: "Inaktiv", variant: "warning" },
  ersetzt: { label: "Ersetzt", variant: "neutral" },
};

interface TicketTableProps {
  tickets: OrderTicket[];
  /** Where the per-ticket PDF route lives - it hangs off the order either way. */
  orderNumber: string;
  target: TicketActionTarget;
}

export function TicketTable({ tickets, orderNumber, target }: TicketTableProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<OrderTicket | null>(null);
  const [regenerating, setRegenerating] = useState<OrderTicket | null>(null);

  function run(action: () => Promise<void>, failureMessage: string, done?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        done?.();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : failureMessage);
        done?.();
      }
    });
  }

  function handleRenameBlur(ticket: OrderTicket, event: React.FocusEvent<HTMLInputElement>) {
    const newName = event.target.value.trim();
    if (!newName || newName === ticket.holder_name) return;
    run(() => renameTicketHolderAction(ticket.id, newName, target), "Fehler beim Umbenennen.");
  }

  const columns: TableColumn<OrderTicket>[] = [
    {
      key: "art",
      header: "Art des Tickets",
      render: (ticket) =>
        ticketTypeLabel({
          productName: ticket.product_name_snapshot,
          transferable: ticket.transferable,
          transferableIndex: ticket.transferable_index,
        }),
    },
    {
      key: "name",
      header: "Vor- und Nachname",
      render: (ticket) => (
        <input
          type="text"
          defaultValue={ticket.holder_name ?? ""}
          placeholder="–"
          disabled={ticket.status === "storniert" || ticket.status === "ersetzt"}
          onBlur={(event) => handleRenameBlur(ticket, event)}
          className={styles.nameInput}
          aria-label="Name auf der Karte"
        />
      ),
    },
    {
      key: "qr",
      header: "QR-Code",
      render: (ticket) => {
        const state = QR_STATE[ticket.status];
        return <Badge variant={state.variant}>{state.label}</Badge>;
      },
    },
    {
      key: "versendet",
      header: "Versendet",
      render: (ticket) =>
        ticket.card_sent_at ? (
          dateFormatter.format(new Date(ticket.card_sent_at))
        ) : ticket.status === "ersetzt" ? (
          "–"
        ) : (
          <span className={styles.pending}>Offen</span>
        ),
    },
    {
      key: "pdf",
      header: "PDF",
      render: (ticket) =>
        ticket.pdf_path ? (
          <a
            href={`/admin/orders/${orderNumber}/tickets/${ticket.id}`}
            className={styles.pdfLink}
            aria-label="PDF herunterladen"
            title="PDF herunterladen"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15h12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : (
          <span className={styles.pending} title="Für diese Karte wurde nie eine PDF hinterlegt.">
            fehlt
          </span>
        ),
    },
    {
      key: "aktionen",
      header: <span className={styles.visuallyHidden}>Aktionen</span>,
      render: (ticket) => {
        if (ticket.status === "ersetzt") return null;
        return (
          <div className={styles.rowActions}>
            {ticket.status !== "storniert" && (
              <button type="button" className={styles.rowAction} onClick={() => setDeactivating(ticket)} disabled={isPending}>
                Deaktivieren
              </button>
            )}
            <button type="button" className={styles.rowAction} onClick={() => setRegenerating(ticket)} disabled={isPending}>
              Code neu generieren
            </button>
          </div>
        );
      },
    },
  ];

  function describe(ticket: OrderTicket | null): string {
    if (!ticket) return "";
    const label = ticketTypeLabel({
      productName: ticket.product_name_snapshot,
      transferable: ticket.transferable,
      transferableIndex: ticket.transferable_index,
    });
    return ticket.holder_name ? `${label} für ${ticket.holder_name}` : label;
  }

  return (
    <>
      <Table caption="Karten" columns={columns} rows={tickets} getRowKey={(ticket) => ticket.id} />
      {error && <p className={styles.error}>{error}</p>}

      <Modal open={!!deactivating} onClose={() => setDeactivating(null)} title="Karte deaktivieren">
        <p className={styles.dialogText}>
          <strong>{describe(deactivating)}</strong> deaktivieren? Der QR-Code wird am Einlass ab sofort abgewiesen. Das
          lässt sich nicht rückgängig machen — für eine gültige Ersatzkarte anschliessend &quot;Code neu
          generieren&quot; wählen.
        </p>
        <p className={styles.dialogNote}>
          Ein Scannergerät, das gerade läuft, kennt die Änderung erst nach einem Neustart: es entscheidet aus der
          Ticketliste, die es beim Start geladen hat.
        </p>
        <div className={styles.dialogActions}>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              deactivating &&
              run(() => deactivateTicketAction(deactivating.id, target), "Fehler beim Deaktivieren.", () =>
                setDeactivating(null)
              )
            }
          >
            Deaktivieren
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDeactivating(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>

      <Modal open={!!regenerating} onClose={() => setRegenerating(null)} title="Code neu generieren">
        <p className={styles.dialogText}>
          Für <strong>{describe(regenerating)}</strong> einen neuen QR-Code erzeugen? Die bisherige Karte wird ungültig
          {regenerating?.transferable_index ? `, die Nummer ${regenerating.transferable_index} bleibt bestehen` : ""}.
          Die neue Karte zählt als noch nicht versendet.
        </p>
        <div className={styles.dialogActions}>
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              regenerating &&
              run(() => regenerateTicketAction(regenerating.id, target), "Fehler beim Neu-Generieren.", () =>
                setRegenerating(null)
              )
            }
          >
            Neu generieren
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRegenerating(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>
    </>
  );
}
