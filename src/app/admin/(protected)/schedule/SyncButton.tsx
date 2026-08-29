"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { syncGamesNow } from "./actions";

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSync() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await syncGamesNow();
        setMessage(
          result.skipped > 0
            ? `${result.synced} Spiele synchronisiert, ${result.skipped} von Hand angepasste übersprungen.`
            : `${result.synced} Spiele von Swiss Unihockey synchronisiert.`
        );
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler bei der Synchronisierung.");
      }
    });
  }

  return (
    <div>
      <Button variant="secondary" onClick={handleSync} disabled={isPending}>
        {isPending ? "Synchronisiere..." : "Jetzt synchronisieren"}
      </Button>
      {message && <p style={{ color: "var(--color-text-secondary)" }}>{message}</p>}
      {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}
    </div>
  );
}
