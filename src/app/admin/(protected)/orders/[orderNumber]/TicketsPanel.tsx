"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { TicketTable } from "@/components/admin/TicketTable/TicketTable";
import { updateFilesHandedOver } from "../actions";
import type { OrderTicket } from "@/lib/admin/tickets";
import styles from "../../admin.module.css";

interface TicketsPanelProps {
  orderId: string;
  orderNumber: string;
  tickets: OrderTicket[];
  filesHandedOverAt: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

export function TicketsPanel({ orderId, orderNumber, tickets, filesHandedOverAt }: TicketsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2>Tickets</h2>
      </div>

      {/* The same table a member's page shows. Whether a card has been e-mailed
          is per card now, so the panel no longer carries a single "versendet"
          badge for the whole order - the Versendet column says it per row. */}
      <TicketTable tickets={tickets} orderNumber={orderNumber} target={{ orderNumber }} />

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
    </div>
  );
}
