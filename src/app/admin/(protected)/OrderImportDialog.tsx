"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal/Modal";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { decodeCsvBytes } from "@/lib/csv/memberCsv";
import { ORDER_CSV_COLUMNS } from "@/lib/csv/orderCsv";
import type { OrderImportPlan } from "@/lib/admin/order-import";
import { planOrderImportAction, createImportBatchAction, applyOrderImportAction, rollbackImportBatchAction } from "./import-actions";
import styles from "./admin.module.css";

/**
 * The three-step import (brief §3): file, preview with a verdict per row,
 * confirm. The file is read in the browser and sent as text; the server parses
 * it twice, once to plan and once to write, and never trusts a plan sent back.
 */

interface ImportOutcome {
  batchId: string;
  imported: number;
  skipped: number;
  failed: Array<{ line: number; externalRef: string | null; reason: string }>;
  rolledBack?: boolean;
}

const CHUNK = 5;

const STATE_BADGE = {
  ok: { label: "OK", variant: "success" as const },
  error: { label: "Fehler", variant: "warning" as const },
  duplicate: { label: "Bereits importiert", variant: "neutral" as const },
};

export function OrderImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [plan, setPlan] = useState<OrderImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  function reset() {
    setContent(null);
    setFilename("");
    setPlan(null);
    setProgress(null);
    setOutcome(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function close() {
    if (progress) return;
    reset();
    onClose();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPlan(null);
    setOutcome(null);
    setFilename(file.name);
    // Not file.text(): that always decodes as UTF-8 and mangles an Excel export.
    const text = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    setContent(text);
    startTransition(async () => {
      try {
        setPlan(await planOrderImportAction(text));
      } catch (planError) {
        setError(planError instanceof Error ? planError.message : "Die Datei konnte nicht gelesen werden.");
      }
    });
  }

  function handleImport() {
    if (!content || !plan) return;
    setError(null);
    startTransition(async () => {
      try {
        const total = plan.rows.length;
        const batchId = await createImportBatchAction(filename, plan.counts.ok);
        const result: ImportOutcome = { batchId, imported: 0, skipped: 0, failed: [] };
        setProgress({ done: 0, total });
        for (let offset = 0; offset < total; offset += CHUNK) {
          const chunk = await applyOrderImportAction(content, batchId, { offset, limit: CHUNK });
          result.imported += chunk.imported;
          result.skipped += chunk.skipped;
          result.failed.push(...chunk.failed);
          setProgress({ done: Math.min(offset + CHUNK, total), total });
        }
        setProgress(null);
        setOutcome(result);
      } catch (importError) {
        setProgress(null);
        setError(importError instanceof Error ? importError.message : "Import fehlgeschlagen.");
      }
    });
  }

  function handleRollback() {
    if (!outcome) return;
    setError(null);
    startTransition(async () => {
      try {
        await rollbackImportBatchAction(outcome.batchId);
        setOutcome({ ...outcome, rolledBack: true });
      } catch (rollbackError) {
        setError(rollbackError instanceof Error ? rollbackError.message : "Rollback fehlgeschlagen.");
      }
    });
  }

  return (
    <Modal open={open} onClose={close} title="Bestellungen aus CSV importieren">
      <div className={styles.form} style={{ maxWidth: 760 }}>
        {!outcome && (
          <>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
              Semikolon-getrennt, UTF-8, mit Kopfzeile. Spalten: <code>{ORDER_CSV_COLUMNS.join(";")}</code>. Es wird keine E-Mail
              versendet - die Kunden informierst du später über «E-Mail versenden…».
            </p>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} aria-label="CSV-Datei" />
          </>
        )}

        {isPending && !plan && content && !outcome && <p>Datei wird geprüft …</p>}

        {plan && !outcome && (
          <>
            {plan.errors.length > 0 ? (
              <p className={styles.errorMessage}>{plan.errors.join(" ")}</p>
            ) : (
              <>
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryTile} data-size="compact" data-tone="success">
                    <span className={styles.summaryValue}>{plan.counts.ok}</span>
                    <span className={styles.summaryLabel}>werden importiert</span>
                  </div>
                  <div className={styles.summaryTile} data-size="compact">
                    <span className={styles.summaryValue}>{plan.counts.duplicate}</span>
                    <span className={styles.summaryLabel}>bereits importiert</span>
                  </div>
                  <div className={styles.summaryTile} data-size="compact" data-tone={plan.counts.error > 0 ? "accent" : undefined}>
                    <span className={styles.summaryValue}>{plan.counts.error}</span>
                    <span className={styles.summaryLabel}>mit Fehler</span>
                  </div>
                </div>
                <div className={styles.csvConflictList} style={{ maxHeight: 360, overflow: "auto" }}>
                  {plan.rows.map((row) => (
                    <div key={row.line} className={styles.csvConflictRow}>
                      <span style={{ color: "var(--color-text-secondary)", minWidth: 56 }}>Zeile {row.line}</span>
                      <Badge variant={STATE_BADGE[row.state].variant}>{STATE_BADGE[row.state].label}</Badge>
                      <span className={styles.csvConflictDetail}>
                        <strong>{row.externalRef ?? "–"}</strong> {row.summary ?? ""}
                        {row.reason ? <span style={{ color: "var(--color-warning-text)" }}> {row.reason}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {progress && (
          <div className={styles.progressPanel}>
            <div className={styles.progressHead}>
              <span>
                {progress.done} von {progress.total} Zeilen verarbeitet
              </span>
              <span className={styles.progressPercent}>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {outcome && (
          <div className={styles.form}>
            <p className={outcome.failed.length === 0 ? styles.successMessage : styles.warningMessage} style={{ marginBottom: 0 }}>
              {outcome.imported} Bestellung(en) importiert, {outcome.skipped} übersprungen (bereits vorhanden oder fehlerhaft).
              {outcome.failed.length > 0 && ` ${outcome.failed.length} fehlgeschlagen: ${outcome.failed.map((f) => `Zeile ${f.line} (${f.reason})`).join("; ")}`}
            </p>
            {outcome.rolledBack ? (
              <p className={styles.successMessage} style={{ marginBottom: 0 }}>
                Batch zurückgerollt - die importierten Bestellungen und Karten sind wieder entfernt.
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                <Link href={`/admin/import/${outcome.batchId}`} className={styles.orderLink}>
                  Zum Batch
                </Link>{" "}
                - dort lässt sich der Import auch später noch zurückrollen, solange keine Karte gescannt wurde.
              </p>
            )}
          </div>
        )}

        {error && <p className={styles.errorMessage}>{error}</p>}

        <div className={styles.actions} style={{ marginBottom: 0 }}>
          {plan && !outcome && plan.errors.length === 0 && (
            <Button type="button" onClick={handleImport} disabled={isPending || plan.counts.ok === 0 || progress !== null}>
              {plan.counts.ok} Bestellung(en) importieren
            </Button>
          )}
          {outcome && !outcome.rolledBack && outcome.imported > 0 && (
            <Button type="button" variant="secondary" onClick={handleRollback} disabled={isPending}>
              Batch zurückrollen
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={close} disabled={progress !== null}>
            {outcome ? "Fertig" : "Abbrechen"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
