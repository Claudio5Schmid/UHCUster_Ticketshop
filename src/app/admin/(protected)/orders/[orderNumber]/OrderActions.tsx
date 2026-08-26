"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { updateOrderStatus, updateRefundOwed } from "../actions";
import type { OrderStatus } from "@/lib/admin/orders";
import styles from "../../admin.module.css";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  neu: "rechnung_versendet",
  rechnung_versendet: "bezahlt",
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  neu: "Als 'Rechnung versendet' markieren",
  rechnung_versendet: "Als 'Bezahlt' markieren",
};

interface OrderActionsProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  refundOwed: boolean;
}

export function OrderActions({ orderId, orderNumber, status, refundOwed }: OrderActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextStatus = NEXT_STATUS[status];

  function handleStatusChange(newStatus: OrderStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrderStatus(orderId, orderNumber, newStatus);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  function handleRefundToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await updateRefundOwed(orderId, orderNumber, !refundOwed);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <div>
      <div className={styles.actions}>
        {nextStatus && (
          <Button onClick={() => handleStatusChange(nextStatus)} disabled={isPending}>
            {NEXT_STATUS_LABEL[status]}
          </Button>
        )}
        {status !== "storniert" && (
          <Button variant="secondary" onClick={() => handleStatusChange("storniert")} disabled={isPending}>
            Stornieren
          </Button>
        )}
        {status === "storniert" && (
          <Button variant="secondary" onClick={handleRefundToggle} disabled={isPending}>
            {refundOwed ? "Rückerstattung als erledigt markieren" : "Rückerstattung offen markieren"}
          </Button>
        )}
      </div>
      {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}
    </div>
  );
}
