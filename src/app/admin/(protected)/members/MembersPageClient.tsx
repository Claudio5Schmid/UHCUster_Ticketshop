"use client";

import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { createMemberAction, importCsvAction, sendPendingCardsAction } from "./actions";
import type { Member } from "@/lib/admin/members";
import { CSV_FIELDS, parseCsvHeader, detectColumnMapping, type CsvColumnMapping, type CsvField } from "@/lib/csv/memberCsv";
import styles from "../admin.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

const DEFAULT_SUBJECT = "Deine Mitgliederkarte UHC Uster";
const DEFAULT_BODY = `Hallo {{vorname}},

im Anhang findest du deine Mitgliederkarte(n) für die Saison 26/27 als PDF.

Sportliche Grüsse
UHC Uster`;

function statusFor(member: Member): { label: string; variant: "neutral" | "accent" | "outline" } {
  if (!member.order_id) return { label: "Keine Karte", variant: "outline" };
  if (member.cards_sent_at) return { label: `Versendet ${dateFormatter.format(new Date(member.cards_sent_at))}`, variant: "neutral" };
  return { label: "Bereit zum Versand", variant: "accent" };
}

export function MembersPageClient({ members, pendingCount }: { members: Member[]; pendingCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Collapsible sections - both start closed, revealed via a button (like "Importieren")
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);

  // Single-member form
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [mitgliederkarte, setMitgliederkarte] = useState(true);
  const [transferableCount, setTransferableCount] = useState(0);

  // CSV import - a file is read client-side first so the admin can confirm/fix
  // the column mapping before anything is actually imported.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping>({});
  const [csvResultMessage, setCsvResultMessage] = useState<string | null>(null);

  // Batch send
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [confirmation, setConfirmation] = useState("");
  const [sendResultMessage, setSendResultMessage] = useState<string | null>(null);

  function handleCreateMember(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createMemberAction({
          vorname,
          nachname,
          email,
          kategorie: kategorie.trim() || null,
          mitgliederkarte,
          transferableCodeCount: transferableCount,
        });
        setVorname("");
        setNachname("");
        setEmail("");
        setKategorie("");
        setMitgliederkarte(true);
        setTransferableCount(0);
        setShowAddForm(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Erfassen.");
      }
    });
  }

  async function handleCsvFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setCsvResultMessage(null);
    const content = await file.text();
    const header = parseCsvHeader(content);
    setCsvContent(content);
    setCsvHeader(header);
    setCsvMapping(detectColumnMapping(header));
  }

  function handleCsvMappingChange(field: CsvField, value: string) {
    setCsvMapping((prev) => ({ ...prev, [field]: value === "" ? undefined : parseInt(value, 10) }));
  }

  function handleCsvCancel() {
    setCsvContent(null);
    setCsvHeader([]);
    setCsvMapping({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCsvImport() {
    if (!csvContent) return;
    setError(null);
    setCsvResultMessage(null);
    startTransition(async () => {
      try {
        const result = await importCsvAction(csvContent, csvMapping);
        setCsvResultMessage(
          `${result.imported} Mitglieder importiert.` +
            (result.failed.length > 0 ? ` ${result.failed.length} Zeilen übersprungen: ${result.failed.map((f) => f.reason).join("; ")}` : "")
        );
        handleCsvCancel();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Import.");
      }
    });
  }

  function handleSend() {
    setError(null);
    setSendResultMessage(null);
    startTransition(async () => {
      try {
        const result = await sendPendingCardsAction(subject, body, confirmation);
        setSendResultMessage(
          `${result.sent} E-Mails versendet.` +
            (result.failed.length > 0 ? ` ${result.failed.length} fehlgeschlagen: ${result.failed.map((f) => `${f.email} (${f.reason})`).join("; ")}` : "")
        );
        setConfirmation("");
        setShowSendForm(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Versand.");
      }
    });
  }

  const columns: TableColumn<Member>[] = [
    { key: "name", header: "Name", render: (m) => `${m.vorname} ${m.nachname}` },
    { key: "email", header: "E-Mail", render: (m) => m.email },
    { key: "kategorie", header: "Kategorie", render: (m) => m.kategorie ?? "–" },
    { key: "karte", header: "Karte", render: (m) => (m.mitgliederkarte ? "Ja" : "Nein") },
    { key: "uebertragbar", header: "Übertragbar", render: (m) => m.transferable_code_count },
    {
      key: "status",
      header: "Status",
      render: (m) => {
        const status = statusFor(m);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Mitglieder</h1>
      </div>
      {error && <p style={{ color: "var(--color-error-text)", marginBottom: "var(--space-4)" }}>{error}</p>}

      <div className={styles.section}>
        <h2>CSV-Import</h2>
        {!csvContent && (
          <>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Spalten: Vorname, Name, Email, Kategorie, Mitgliederkarte (ja/nein), Anzahl übertragbare Codes. Die
              Zuordnung der Spalten kannst du im nächsten Schritt prüfen und anpassen.
            </p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvFileChange} />
          </>
        )}
        {csvContent && (
          <div className={styles.form}>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Welche Spalte aus der Datei gehört zu welchem Feld? (* = Pflichtfeld)
            </p>
            {CSV_FIELDS.map((field) => (
              <Select
                key={field.key}
                label={`${field.label}${field.required ? " *" : ""}`}
                value={csvMapping[field.key] ?? ""}
                onChange={(e) => handleCsvMappingChange(field.key, e.target.value)}
              >
                <option value="">– nicht vorhanden –</option>
                {csvHeader.map((column, index) => (
                  <option key={index} value={index}>
                    {column || `Spalte ${index + 1}`}
                  </option>
                ))}
              </Select>
            ))}
            <div className={styles.actions}>
              <Button
                type="button"
                disabled={isPending || CSV_FIELDS.some((f) => f.required && csvMapping[f.key] === undefined)}
                onClick={handleCsvImport}
              >
                Importieren
              </Button>
              <Button type="button" variant="secondary" onClick={handleCsvCancel}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}
        {csvResultMessage && <p style={{ color: "var(--color-text-secondary)" }}>{csvResultMessage}</p>}
      </div>

      <div className={styles.section}>
        <h2>Mitgliederliste</h2>
        <Table caption="Mitglieder" columns={columns} rows={members} getRowKey={(m) => m.id} />
      </div>

      <div className={styles.section}>
        <div className={styles.header}>
          <h2>Einzelnes Mitglied erfassen</h2>
          {!showAddForm && (
            <Button type="button" variant="secondary" onClick={() => setShowAddForm(true)}>
              Mitglied hinzufügen
            </Button>
          )}
        </div>
        {showAddForm && (
          <form onSubmit={handleCreateMember} className={styles.form}>
            <Input label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} required />
            <Input label="Name" value={nachname} onChange={(e) => setNachname(e.target.value)} required />
            <Input label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="z.B. Funktionär, Spieler" />
            <label>
              <input type="checkbox" checked={mitgliederkarte} onChange={(e) => setMitgliederkarte(e.target.checked)} /> Mitgliederkarte
              (persönlich, nicht übertragbar)
            </label>
            <Input
              label="Anzahl übertragbare Codes"
              type="number"
              min={0}
              value={transferableCount}
              onChange={(e) => setTransferableCount(parseInt(e.target.value, 10) || 0)}
            />
            <div className={styles.actions}>
              <Button type="submit" disabled={isPending}>
                Erfassen und Karte(n) generieren
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.header}>
          <h2>Karten versenden</h2>
          {!showSendForm && (
            <Button type="button" variant="secondary" onClick={() => setShowSendForm(true)} disabled={pendingCount === 0}>
              {pendingCount} Karte(n) versenden
            </Button>
          )}
        </div>
        {showSendForm && (
          <div className={styles.form}>
            <p style={{ color: "var(--color-text-secondary)" }}>
              {pendingCount} Mitglieder warten auf den Versand ihrer Karte(n). Nachricht kann vor dem Versand angepasst werden -
              Platzhalter <code>{"{{vorname}}"}</code> und <code>{"{{nachname}}"}</code> stehen zur Verfügung.
            </p>
            <Input label="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <label>
              Nachricht
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                style={{ width: "100%", fontFamily: "var(--font-sans)", padding: "var(--space-3)" }}
              />
            </label>
            <Input
              label='Zum Bestätigen "Versenden" eingeben'
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <div className={styles.actions}>
              <Button onClick={handleSend} disabled={isPending || confirmation !== "Versenden" || pendingCount === 0}>
                {pendingCount} Karte(n) jetzt versenden
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowSendForm(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}
        {sendResultMessage && <p style={{ color: "var(--color-text-secondary)" }}>{sendResultMessage}</p>}
      </div>
    </div>
  );
}
