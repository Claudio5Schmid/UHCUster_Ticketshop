"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Modal } from "@/components/ui/Modal/Modal";
import { updateFilesHandedOver, renameTicketHolder, voidTicket } from "../actions";
import type { OrderTicket } from "@/lib/admin/tickets";
import styles from "../../admin.module.css";

const STATUS_LABELS: Record<OrderTicket["status"], string> = {
  gueltig: "Gültig",
  eingeloest: "Eingelöst",
  storniert: "Storniert",
  ersetzt: "Ersetzt",
};

interface TicketsPanelProps {
  orderId: string;
  orderNumber: string;
  tickets: OrderTicket[];
  filesHandedOverAt: string | null;
  cardsSentAt: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

export function TicketsPanel({ orderId, orderNumber, tickets, filesHandedOverAt, cardsSentAt }: TicketsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voidingTicket, setVoidingTicket] = useState<OrderTicket | null>(null);
  const handedOver = Boolean(filesHandedOverAt);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await updateFilesHandedOver(orderId, orderNumber, !handedOver);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  function handleRenameBlur(ticket: OrderTicket, event: React.FocusEvent<HTMLInputElement>) {
    const newName = event.target.value.trim();
    if (!newName || newName === ticket.holder_name) return;
    setError(null);
    startTransition(async () => {
      try {
        await renameTicketHolder(ticket.id, orderNumber, newName);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Umbenennen.");
      }
    });
  }

  function handleVoidConfirm() {
    if (!voidingTicket) return;
    setError(null);
    startTransition(async () => {
      try {
        await voidTicket(voidingTicket.id, orderNumber);
        setVoidingTicket(null);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Stornieren.");
        setVoidingTicket(null);
      }
    });
  }

  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2>Tickets</h2>
        {cardsSentAt && <Badge variant="accent">Tickets versendet {dateFormatter.format(new Date(cardsSentAt))}</Badge>}
      </div>
      <div className={styles.copyBlock}>
        {tickets.map((ticket) => {
          const canEdit = ticket.status === "gueltig" || ticket.status === "eingeloest";
          return (
            <div key={ticket.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span>{ticket.product_name_snapshot} -</span>
              <input
                type="text"
                defaultValue={ticket.holder_name ?? ""}
                placeholder="–"
                disabled={!canEdit}
                onBlur={(e) => handleRenameBlur(ticket, e)}
                className={styles.inlineEdit}
                style={{ width: "160px" }}
              />
              <span>-</span>
              <Badge variant={ticket.status === "gueltig" ? "accent" : "neutral"}>{STATUS_LABELS[ticket.status]}</Badge>
              <a href={`/admin/orders/${orderNumber}/tickets/${ticket.id}`}>PDF herunterladen</a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setVoidingTicket(ticket)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    color: "var(--color-error-text)",
                    textDecoration: "underline",
                    fontSize: "var(--text-small-size)",
                  }}
                >
                  Stornieren
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.actions} style={{ alignItems: "center" }}>
        <Button as="a" href={`/admin/orders/${orderNumber}/tickets-zip`} variant="secondary">
          Alle als ZIP herunterladen
        </Button>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          style={{ all: "unset", cursor: isPending ? "default" : "pointer" }}
          aria-label={handedOver ? "Als nicht übergeben markieren" : "Als übergeben markieren"}
        >
          <Badge variant={handedOver ? "accent" : "outline"}>
            {handedOver && filesHandedOverAt ? `Übergeben ${dateFormatter.format(new Date(filesHandedOverAt))}` : "Nicht übergeben"}
          </Badge>
        </button>
      </div>
      {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}

      <Modal open={!!voidingTicket} onClose={() => setVoidingTicket(null)} title="Ticket stornieren">
        <p style={{ marginBottom: "var(--space-5)" }}>
          Ticket {voidingTicket?.holder_name ? `für ${voidingTicket.holder_name} ` : ""}(
          {voidingTicket?.product_name_snapshot}) stornieren? Es wird kein Ersatzticket ausgestellt - der Eintrag
          bleibt als &quot;Storniert&quot; erhalten, wird aber nicht mehr am Einlass akzeptiert.
        </p>
        <div className={styles.actions}>
          <Button type="button" onClick={handleVoidConfirm} disabled={isPending}>
            Stornieren
          </Button>
          <Button type="button" variant="secondary" onClick={() => setVoidingTicket(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>
    </div>
  );
}
