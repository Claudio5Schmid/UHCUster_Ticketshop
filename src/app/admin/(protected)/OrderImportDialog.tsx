"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal/Modal";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Select } from "@/components/ui/Select/Select";
import { decodeCsvBytes } from "@/lib/csv/memberCsv";
import {
  ORDER_CSV_FIELDS,
  detectOrderMapping,
  missingRequiredFields,
  parseOrderCsvHeader,
  type ImportableProduct,
  type OrderCsvField,
  type OrderCsvMapping,
} from "@/lib/csv/orderCsv";
import { PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@/lib/products";
import type { OrderImportPlan } from "@/lib/admin/order-import";
import {
  planOrderImportAction,
  createImportBatchAction,
  applyOrderImportAction,
  rollbackImportBatchAction,
  importOptionsAction,
} from "./import-actions";
import styles from "./admin.module.css";

/**
 * The import, in the same four steps as the member one (brief §3): choose the
 * file, say which column belongs to which field, look at what would happen row
 * by row, confirm. The file is read in the browser and sent as text; the server
 * parses it twice, once to plan and once to write, and never trusts a plan sent
 * back to it.
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

const STATUS_CHOICES = [
  { value: "neu", label: "neu" },
  { value: "rechnung_versendet", label: "Rechnung versendet" },
  { value: "bezahlt", label: "bezahlt" },
  { value: "storniert", label: "storniert" },
];

/** A field's select carries the file's columns and, where one value can stand
 *  for the whole file, those values too - both in one list, told apart by the
 *  group they sit in. */
function fixedChoicesFor(
  field: OrderCsvField,
  products: ImportableProduct[],
  /** Set when the whole file is one product, which narrows what a variant can be. */
  fixedCategory: ProductCategory | null
): Array<{ value: string; label: string }> {
  if (field === "category") {
    const used = [...new Set(products.map((product) => product.category))];
    return used.map((category) => ({ value: category, label: PRODUCT_CATEGORY_LABELS[category as ProductCategory] }));
  }
  if (field === "variant") {
    const candidates = fixedCategory ? products.filter((product) => product.category === fixedCategory) : products;
    return candidates.map((product) => ({
      value: product.variant,
      label: fixedCategory ? product.label : `${PRODUCT_CATEGORY_LABELS[product.category]}: ${product.label}`,
    }));
  }
  if (field === "status") return STATUS_CHOICES;
  if (field === "quantity") return [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} Karten` }));
  return [];
}

export function OrderImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<OrderCsvMapping>({});
  const [products, setProducts] = useState<ImportableProduct[]>([]);
  const [plan, setPlan] = useState<OrderImportPlan | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  function reset() {
    setContent(null);
    setFilename("");
    setHeader([]);
    setMapping({});
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
    const columns = parseOrderCsvHeader(text);
    setContent(text);
    setHeader(columns);
    setMapping(detectOrderMapping(columns));
    startTransition(async () => {
      try {
        setProducts(await importOptionsAction());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Die Produkte konnten nicht geladen werden.");
      }
    });
  }

  /** "" = not mapped, "col:3" = the file's fourth column, "fix:gold" = one value
   *  for every row. */
  function handleMappingChange(field: OrderCsvField, raw: string) {
    setMapping((previous) => {
      const next = { ...previous };
      if (!raw) delete next[field];
      else if (raw.startsWith("col:")) next[field] = { column: Number(raw.slice(4)) };
      else next[field] = { fixed: raw.slice(4) };
      return next;
    });
  }

  function mappingValue(field: OrderCsvField): string {
    const source = mapping[field];
    if (!source) return "";
    return "fixed" in source ? `fix:${source.fixed}` : `col:${source.column}`;
  }

  function handlePlan() {
    if (!content) return;
    setError(null);
    startTransition(async () => {
      try {
        setPlan(await planOrderImportAction(content, mapping));
      } catch (planError) {
        setError(planError instanceof Error ? planError.message : "Die Datei konnte nicht geprüft werden.");
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
          const chunk = await applyOrderImportAction(content, mapping, batchId, { offset, limit: CHUNK });
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

  const stillMissing = missingRequiredFields(mapping);
  const categorySource = mapping.category;
  const fixedCategory = categorySource && "fixed" in categorySource ? (categorySource.fixed as ProductCategory) : null;

  return (
    <Modal open={open} onClose={close} title="Bestellungen aus CSV importieren">
      <div className={styles.form} style={{ maxWidth: 760 }}>
        {/* Step one: the file. */}
        {!content && (
          <>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
              Eine Zeile pro Bestellung, mit Kopfzeile. Welche Spalte zu welchem Feld gehört, legst du im nächsten Schritt fest. Es wird
              keine E-Mail versendet - die Kunden informierst du später über «E-Mail versenden…».
            </p>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} aria-label="CSV-Datei" />
          </>
        )}

        {/* Step two: the mapping. */}
        {content && !plan && !outcome && (
          <>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
              Welche Spalte aus <strong>{filename}</strong> gehört zu welchem Feld? (* = Pflichtfeld). Produkt, Variante, Anzahl und Status
              kannst du auch für die ganze Datei festlegen, wenn sie keine eigene Spalte dafür hat.
            </p>
            {ORDER_CSV_FIELDS.map((field) => {
              const fixedChoices = field.allowsFixed ? fixedChoicesFor(field.key, products, fixedCategory) : [];
              return (
                <Select
                  key={field.key}
                  label={`${field.label}${field.required ? " *" : ""}`}
                  value={mappingValue(field.key)}
                  onChange={(event) => handleMappingChange(field.key, event.target.value)}
                >
                  <option value="">– nicht vorhanden –</option>
                  <optgroup label="Spalte aus der Datei">
                    {header.map((column, index) => (
                      <option key={index} value={`col:${index}`}>
                        {column || `Spalte ${index + 1}`}
                      </option>
                    ))}
                  </optgroup>
                  {fixedChoices.length > 0 && (
                    <optgroup label="Fester Wert für alle Zeilen">
                      {fixedChoices.map((choice) => (
                        <option key={choice.value} value={`fix:${choice.value}`}>
                          {choice.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              );
            })}
            <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-micro-size)", margin: 0 }}>
              {ORDER_CSV_FIELDS.filter((field) => field.hint).map((field) => `${field.label}: ${field.hint}`).join(" · ")}
            </p>
          </>
        )}

        {isPending && content && !plan && !outcome && products.length === 0 && <p>Produkte werden geladen …</p>}

        {/* Step three: what the file would do. */}
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

        {/* Step four: what happened. */}
        {outcome && (
          <div className={styles.form}>
            <p className={outcome.failed.length === 0 ? styles.successMessage : styles.warningMessage} style={{ marginBottom: 0 }}>
              {outcome.imported} Bestellung(en) importiert, {outcome.skipped} übersprungen (bereits vorhanden oder fehlerhaft).
              {outcome.failed.length > 0 &&
                ` ${outcome.failed.length} fehlgeschlagen: ${outcome.failed.map((f) => `Zeile ${f.line} (${f.reason})`).join("; ")}`}
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
          {content && !plan && !outcome && (
            <Button type="button" onClick={handlePlan} disabled={isPending || stillMissing.length > 0}>
              {stillMissing.length > 0 ? `Noch zuordnen: ${stillMissing.map((f) => f.label).join(", ")}` : "Weiter"}
            </Button>
          )}
          {plan && !outcome && plan.errors.length === 0 && (
            <Button type="button" onClick={handleImport} disabled={isPending || plan.counts.ok === 0 || progress !== null}>
              {plan.counts.ok} Bestellung(en) importieren
            </Button>
          )}
          {plan && !outcome && (
            <Button type="button" variant="secondary" onClick={() => setPlan(null)} disabled={progress !== null}>
              Zurück zur Zuordnung
            </Button>
          )}
          {outcome && !outcome.rolledBack && outcome.imported > 0 && (
            <Button type="button" variant="secondary" onClick={handleRollback} disabled={isPending}>
              Batch zurückrollen
            </Button>
          )}
          {content && !plan && !outcome && (
            <Button type="button" variant="secondary" onClick={reset} disabled={isPending}>
              Andere Datei wählen
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
