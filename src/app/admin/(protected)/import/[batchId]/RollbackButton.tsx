"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Modal } from "@/components/ui/Modal/Modal";
import { rollbackImportBatchAction } from "../../import-actions";
import styles from "../../admin.module.css";

interface RollbackButtonProps {
  batchId: string;
  orderCount: number;
  /** Why the button is disabled, when it is. */
  blockedReason: string | null;
}

/** Rolling a batch back deletes its orders, cards and customers for good - so
 *  it is a dialog that says so, not a click. */
export function RollbackButton({ batchId, orderCount, blockedReason }: RollbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function handleRollback() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await rollbackImportBatchAction(batchId);
        setDone(`${result.orders} Bestellung(en), ${result.tickets} Karte(n) und ${result.customers} Kundendatensatz/-sätze entfernt.`);
        setOpen(false);
      } catch (rollbackError) {
        setError(rollbackError instanceof Error ? rollbackError.message : "Rollback fehlgeschlagen.");
      }
    });
  }

  return (
    <>
      {done && <p className={styles.successMessage}>{done}</p>}
      {blockedReason && <p style={{ color: "var(--color-text-secondary)" }}>{blockedReason}</p>}
      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={!!blockedReason || !!done}>
          Batch zurückrollen
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Import zurückrollen">
        <div className={styles.form}>
          <p style={{ margin: 0 }}>
            Alle <strong>{orderCount}</strong> Bestellungen dieses Imports werden mit ihren Karten und Kundendaten endgültig gelöscht. Die
            Bestellnummern werden nicht wiederverwendet. Das lässt sich nicht rückgängig machen.
          </p>
          {error && <p className={styles.errorMessage}>{error}</p>}
          <div className={styles.actions} style={{ marginBottom: 0 }}>
            <Button type="button" onClick={handleRollback} disabled={isPending}>
              {isPending ? "Wird zurückgerollt …" : "Ja, zurückrollen"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
              Abbrechen
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
