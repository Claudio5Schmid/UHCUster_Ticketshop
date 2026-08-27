"use client";

import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { createMemberAction, importCsvAction, sendPendingCardsAction } from "./actions";
import type { Member } from "@/lib/admin/members";
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

  // Single-member form
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [mitgliederkarte, setMitgliederkarte] = useState(true);
  const [transferableCount, setTransferableCount] = useState(0);

  // CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Erfassen.");
      }
    });
  }

  function handleCsvUpload(event: React.FormEvent) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setCsvResultMessage(null);
    startTransition(async () => {
      try {
        const content = await file.text();
        const result = await importCsvAction(content);
        setCsvResultMessage(
          `${result.imported} Mitglieder importiert.` +
            (result.failed.length > 0 ? ` ${result.failed.length} Zeilen übersprungen: ${result.failed.map((f) => f.reason).join("; ")}` : "")
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
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
        <p style={{ color: "var(--color-text-secondary)" }}>
          Spalten: Vorname, Name, Email, Kategorie, Mitgliederkarte (ja/nein), Anzahl übertragbare Codes.
        </p>
        <form onSubmit={handleCsvUpload} className={styles.inlineForm}>
          <input ref={fileInputRef} type="file" accept=".csv" />
          <Button type="submit" disabled={isPending} variant="secondary">
            Importieren
          </Button>
        </form>
        {csvResultMessage && <p style={{ color: "var(--color-text-secondary)" }}>{csvResultMessage}</p>}
      </div>

      <div className={styles.section}>
        <h2>Einzelnes Mitglied erfassen</h2>
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
          <Button type="submit" disabled={isPending}>
            Erfassen und Karte(n) generieren
          </Button>
        </form>
      </div>

      <div className={styles.section}>
        <h2>Mitgliederliste</h2>
        <Table caption="Mitglieder" columns={columns} rows={members} getRowKey={(m) => m.id} />
      </div>

      <div className={styles.section}>
        <h2>Karten versenden</h2>
        <p style={{ color: "var(--color-text-secondary)" }}>
          {pendingCount} Mitglieder warten auf den Versand ihrer Karte(n). Nachricht kann vor dem Versand angepasst werden - Platzhalter{" "}
          <code>{"{{vorname}}"}</code> und <code>{"{{nachname}}"}</code> stehen zur Verfügung.
        </p>
        <div className={styles.form}>
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
          <Button onClick={handleSend} disabled={isPending || confirmation !== "Versenden" || pendingCount === 0}>
            {pendingCount} Karte(n) jetzt versenden
          </Button>
        </div>
        {sendResultMessage && <p style={{ color: "var(--color-text-secondary)" }}>{sendResultMessage}</p>}
      </div>
    </div>
  );
}
