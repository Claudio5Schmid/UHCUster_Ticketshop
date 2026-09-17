"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { syncDeliveryHistoryAction } from "@/app/admin/(protected)/delivery-actions";
import type { BackfillReport } from "@/lib/admin/email-backfill";

/**
 * Brings the shop level with what Resend knows.
 *
 * The delivery log only covers mails sent since it was deployed; everything
 * before that has no row for an event to find, so those sends still read as
 * successful whatever became of them. This asks Resend for the history and
 * writes the missing rows, after which the ordinary rule applies to them: a
 * mail that never arrived puts its cards back to open.
 *
 * Running it again is harmless, so it is an ordinary button rather than a
 * guarded one - nothing is sent, only read and recorded.
 */
export function SyncDeliveryButton() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BackfillReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const result = await syncDeliveryHistoryAction();
      if (result.error) setError(result.error);
      else setReport(result);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Abgleich fehlgeschlagen.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={handleClick} disabled={running}>
        {running ? "Wird abgeglichen…" : "Zustellstatus abgleichen"}
      </Button>
      {error && <span style={{ color: "var(--color-error-text)", maxWidth: "48ch" }}>{error}</span>}
      {report && (
        <span style={{ color: "var(--color-text-secondary)" }}>
          {report.added} nachgetragen, davon {report.undeliverable} nicht zugestellt
          {report.known > 0 && `, ${report.known} bereits bekannt`}
          {report.unmatched.length > 0 && `, ${report.unmatched.length} ohne Zuordnung`}.
        </span>
      )}
    </>
  );
}
