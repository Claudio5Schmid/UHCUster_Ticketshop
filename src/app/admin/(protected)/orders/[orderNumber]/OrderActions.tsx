"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Modal } from "@/components/ui/Modal/Modal";
import { Input } from "@/components/ui/Input/Input";
import { updateOrderStatus, updateRefundOwed, updateInvoiceNumber, issueMissingTickets } from "../actions";
import type { OrderStatus } from "@/lib/admin/orders";
import styles from "../../admin.module.css";
import own from "./invoice.module.css";

interface OrderActionsProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  refundOwed: boolean;
  invoiceNumber: string | null;
  /** Live cards on the order - a cancel dialog says how many stop working. */
  liveTickets: number;
  /** No cards at all yet: offer to create them. */
  hasTickets: boolean;
}

/**
 * The status walk (D78) as buttons, each irreversible step behind a dialog:
 * "Rechnung versendet" asks for the invoice number it records, "Stornieren"
 * says what it switches off. The database enforces the transitions; this just
 * makes them deliberate.
 */
export function OrderActions({ orderId, orderNumber, status, refundOwed, invoiceNumber, liveTickets, hasTickets }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"invoice" | "paid" | "cancel" | "edit-invoice" | null>(null);
  const [invoiceInput, setInvoiceInput] = useState(invoiceNumber ?? "");

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setDialog(null);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <div>
      <div className={styles.actions}>
        {status === "neu" && (
          <Button onClick={() => setDialog("invoice")} disabled={isPending}>
            Als &apos;Rechnung versendet&apos; markieren
          </Button>
        )}
        {status === "rechnung_versendet" && (
          <Button onClick={() => setDialog("paid")} disabled={isPending}>
            Als &apos;Bezahlt&apos; markieren
          </Button>
        )}
        {(status === "neu" || status === "rechnung_versendet") && (
          <Button variant="secondary" onClick={() => setDialog("cancel")} disabled={isPending}>
            Stornieren
          </Button>
        )}
        {status !== "neu" && status !== "storniert" && (
          <Button variant="secondary" onClick={() => setDialog("edit-invoice")} disabled={isPending}>
            Rechnungsnummer ändern
          </Button>
        )}
        {status === "storniert" && (
          <Button variant="secondary" onClick={() => run(() => updateRefundOwed(orderId, orderNumber, !refundOwed))} disabled={isPending}>
            {refundOwed ? "Rückerstattung als erledigt markieren" : "Rückerstattung offen markieren"}
          </Button>
        )}
        {!hasTickets && status !== "storniert" && (
          <Button variant="secondary" onClick={() => run(() => issueMissingTickets(orderId, orderNumber))} disabled={isPending}>
            Karten erstellen
          </Button>
        )}
      </div>
      {error && !dialog && <p className={styles.errorMessage}>{error}</p>}

      <Modal open={dialog === "invoice"} onClose={() => setDialog(null)} title="Rechnung versendet">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateOrderStatus(orderId, orderNumber, "rechnung_versendet", invoiceInput));
          }}
        >
          <p className={own.dialogText}>
            Bestätigt, dass Rechnung und Karten an den Kunden gegangen sind. Ab jetzt kann der Kunde seine Karten über seinen Link
            herunterladen. Trage die Rechnungsnummer aus der Fibu ein.
          </p>
          <Input label="Rechnungsnummer" value={invoiceInput} onChange={(e) => setInvoiceInput(e.target.value)} autoFocus required />
          {error && <p className={styles.errorMessage}>{error}</p>}
          <div className={styles.actions} style={{ marginTop: "var(--space-4)", marginBottom: 0 }}>
            <Button type="submit" disabled={isPending || !invoiceInput.trim()}>
              Speichern
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "edit-invoice"} onClose={() => setDialog(null)} title="Rechnungsnummer ändern">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateInvoiceNumber(orderId, orderNumber, invoiceInput));
          }}
        >
          <Input label="Rechnungsnummer" value={invoiceInput} onChange={(e) => setInvoiceInput(e.target.value)} autoFocus />
          {error && <p className={styles.errorMessage}>{error}</p>}
          <div className={styles.actions} style={{ marginTop: "var(--space-4)", marginBottom: 0 }}>
            <Button type="submit" disabled={isPending}>
              Speichern
            </Button>
            <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === "paid"} onClose={() => setDialog(null)} title="Als bezahlt markieren">
        <p className={own.dialogText}>
          Die Zahlung zu <strong>{orderNumber}</strong> ist in der Fibu verbucht? Eine bezahlte Bestellung kann danach nicht mehr storniert
          werden.
        </p>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <div className={styles.actions} style={{ marginBottom: 0 }}>
          <Button onClick={() => run(() => updateOrderStatus(orderId, orderNumber, "bezahlt"))} disabled={isPending}>
            Ja, bezahlt
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>

      <Modal open={dialog === "cancel"} onClose={() => setDialog(null)} title="Bestellung stornieren">
        <p className={own.dialogText}>
          <strong>{orderNumber}</strong> stornieren? {liveTickets > 0 ? `Alle ${liveTickets} Karte(n) dieser Bestellung werden deaktiviert:` : "Die Bestellung wird geschlossen:"}{" "}
          der QR-Code wird am Einlass abgewiesen und der Kundenlink zeigt «storniert». Das lässt sich nicht rückgängig machen.
        </p>
        <p className={styles.checkboxRow} style={{ marginBottom: "var(--space-4)", color: "var(--color-text-secondary)" }}>
          Ein Scannergerät, das gerade läuft, kennt die Änderung erst nach einem Neustart.
        </p>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <div className={styles.actions} style={{ marginBottom: 0 }}>
          <Button onClick={() => run(() => updateOrderStatus(orderId, orderNumber, "storniert"))} disabled={isPending}>
            Ja, stornieren
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>
    </div>
  );
}
