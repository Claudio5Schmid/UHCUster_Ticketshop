import { Button } from "@/components/ui/Button/Button";
import { TicketTable } from "@/components/admin/TicketTable/TicketTable";
import type { OrderTicket } from "@/lib/admin/tickets";
import styles from "../../admin.module.css";

interface TicketsPanelProps {
  orderNumber: string;
  tickets: OrderTicket[];
}

/**
 * The cards on an order: the same table a member's page shows, plus the ZIP.
 *
 * No longer a client component. It held state only for the "Übergeben / Nicht
 * übergeben" switch that used to sit beside the download; with that gone there is
 * nothing here to run in the browser. The table itself is still a client
 * component and brings its own interactivity.
 *
 * Whether a card has reached its holder is per card, in the table's Versendet
 * column. orders.files_handed_over_at still exists and is still set when a
 * member's cards are e-mailed - it just has no switch on this page any more.
 */
export function TicketsPanel({ orderNumber, tickets }: TicketsPanelProps) {
  if (tickets.length === 0) {
    return null;
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h2>Tickets</h2>
      </div>

      <TicketTable tickets={tickets} orderNumber={orderNumber} target={{ orderNumber }} />

      <div className={styles.actions}>
        <Button as="a" href={`/admin/orders/${orderNumber}/tickets-zip`} variant="secondary">
          Alle als ZIP herunterladen
        </Button>
      </div>
    </div>
  );
}
