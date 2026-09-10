"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Modal } from "@/components/ui/Modal/Modal";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import {
  createMemberAction,
  importCsvAction,
  planCsvImportAction,
  sendMemberCardsAction,
  updateMemberKategorieAction,
  deleteMembersAction,
} from "./actions";
import { memberSendState, type Member, type MemberSendState } from "@/lib/admin/member-state";
import { CSV_FIELDS, parseCsvHeader, detectColumnMapping, type CsvColumnMapping, type CsvField } from "@/lib/csv/memberCsv";
import type { CsvImportPlan } from "@/lib/admin/members";
import { matchesSendConfirmation } from "@/lib/admin/send-confirmation";
import styles from "../admin.module.css";

type SortKey = "name" | "email" | "kategorie" | "karten" | "versand";

const DEFAULT_SUBJECT = "Deine Mitgliederkarte UHC Uster";
const DEFAULT_BODY = `Hallo {{vorname}},

im Anhang findest du deine Mitgliederkarte(n) für die Saison 26/27 als PDF.

Sportliche Grüsse
UHC Uster`;

const SEND_STATE: Record<MemberSendState, { label: string; variant: "neutral" | "warning" | "success" | "info" }> = {
  ohne: { label: "Keine Karte", variant: "neutral" },
  offen: { label: "Nichts versendet", variant: "warning" },
  teilweise: { label: "Teilweise versendet", variant: "info" },
  vollstaendig: { label: "Vollständig versendet", variant: "success" },
};

/** "2 von 3 versendet" - the thing the office actually wants to know per row. */
function sendSummary(member: Member): string {
  if (member.cards.active === 0) return "–";
  return `${member.cards.sent} von ${member.cards.active} versendet`;
}

export function MembersPageClient({ members, filterBar }: { members: Member[]; filterBar: ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showSendForm, setShowSendForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Single-member form
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [personalCount, setPersonalCount] = useState(1);
  const [transferableCount, setTransferableCount] = useState(0);

  // CSV import - a file is read client-side first so the admin can confirm/fix
  // the column mapping before anything is actually imported.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping>({});
  const [csvResultMessage, setCsvResultMessage] = useState<string | null>(null);
  /* The import is two-stage now: a plan is fetched first and, if it resolves any row
     to a member who already exists, the admin says row by row what to do with them
     before anything is written. csvSelected holds the member numbers to apply. */
  const [csvPlan, setCsvPlan] = useState<CsvImportPlan | null>(null);
  const [csvSelected, setCsvSelected] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [confirmation, setConfirmation] = useState("");
  /* The tone travels with the text. This used to be a bare string always rendered in
     the green success banner, so "0 Karte(n) versendet. 3 fehlgeschlagen" was reported
     to the office as a success - the one thing a status colour must never do. */
  const [sendResult, setSendResult] = useState<{ text: string; tone: "success" | "warning" | "error" } | null>(null);

  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Card totals, not member totals: a member with three cards of which one is
  // still to send is one row but one open card, and the send button counts cards.
  // These describe the list as currently filtered, which is what is on screen.
  const openCards = members.reduce((total, member) => total + member.cards.open, 0);
  const sentCards = members.reduce((total, member) => total + member.cards.sent, 0);
  const noCardCount = members.filter((member) => member.cards.active === 0).length;

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
          personalCardCount: personalCount,
          transferableCardCount: transferableCount,
        });
        setVorname("");
        setNachname("");
        setEmail("");
        setKategorie("");
        setPersonalCount(1);
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
    setCsvPlan(null);
    setCsvSelected(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /** Nothing is written here - this only asks the server what the file would do. */
  function handleCsvPlan() {
    if (!csvContent) return;
    setError(null);
    setCsvResultMessage(null);
    startTransition(async () => {
      try {
        const plan = await planCsvImportAction(csvContent, csvMapping);
        // Nothing to decide means nothing to ask about: a file of purely new members
        // goes straight through rather than through an empty confirmation step.
        if (plan.matches.length === 0) {
          await runCsvImport([]);
          return;
        }
        setCsvPlan(plan);
        setCsvSelected(new Set(plan.matches.map((match) => match.externalId)));
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Prüfen der Datei.");
      }
    });
  }

  async function runCsvImport(applyExternalIds: string[]) {
    if (!csvContent) return;
    const result = await importCsvAction(csvContent, csvMapping, applyExternalIds);
    setCsvResultMessage(
      [
        `${result.imported} neu importiert`,
        `${result.updated} aktualisiert`,
        ...(result.skipped > 0 ? [`${result.skipped} übersprungen`] : []),
      ].join(", ") +
        "." +
        (result.failed.length > 0
          ? ` ${result.failed.length} Zeilen mit Fehler: ${result.failed.map((f) => f.reason).join("; ")}`
          : "")
    );
    handleCsvCancel();
    setShowCsvImport(false);
  }

  function toggleCsvRow(externalId: string) {
    setCsvSelected((prev) => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId);
      else next.add(externalId);
      return next;
    });
  }

  function handleCsvImport() {
    setError(null);
    startTransition(async () => {
      try {
        await runCsvImport([...csvSelected]);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Import.");
      }
    });
  }

  function handleSend() {
    setError(null);
    setSendResult(null);
    startTransition(async () => {
      try {
        const result = await sendMemberCardsAction(subject, body, confirmation, selectedSendableIds);
        const failures = result.failed.length;
        setSendResult({
          // Nothing out at all is an error; a partial send is a warning that still has
          // to say what did go through, so the office knows what not to resend.
          tone: failures === 0 ? "success" : result.sent === 0 ? "error" : "warning",
          text:
            `${result.cards} Karte(n) an ${result.sent} Mitglied(er) versendet.` +
            (failures > 0
              ? ` ${failures} fehlgeschlagen: ${result.failed.map((f) => `${f.email} (${f.reason})`).join("; ")}`
              : ""),
        });
        setConfirmation("");
        setShowSendForm(false);
        setSelectedIds(new Set());
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Versand.");
      }
    });
  }

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function sortValue(member: Member, key: SortKey): string | number {
    switch (key) {
      case "name":
        return `${member.nachname} ${member.vorname}`.toLowerCase();
      case "email":
        return member.email.toLowerCase();
      case "kategorie":
        return (member.kategorie ?? "").toLowerCase();
      case "karten":
        return member.cards.active;
      case "versand":
        // Sorted by how much work is left rather than alphabetically, so the
        // members still waiting for something come first.
        return ["offen", "teilweise", "vollstaendig", "ohne"].indexOf(memberSendState(member));
    }
  }

  const visibleMembers = useMemo(() => {
    if (!sortKey) return members;
    return [...members].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [members, sortKey, sortDirection]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Selecting a member contributes their still-unsent cards - so "3 Karten
  // versenden" means three cards, not three people.
  const selectedMembers = members.filter((member) => selectedIds.has(member.id));
  const selectedSendableIds = selectedMembers.filter((member) => member.cards.open > 0).map((member) => member.id);
  const selectedOpenCards = selectedMembers.reduce((total, member) => total + member.cards.open, 0);

  const allVisibleSelected = visibleMembers.length > 0 && visibleMembers.every((m) => selectedIds.has(m.id));
  const someVisibleSelected = visibleMembers.some((m) => selectedIds.has(m.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleMembers.forEach((m) => next.delete(m.id));
      else visibleMembers.forEach((m) => next.add(m.id));
      return next;
    });
  }

  function handleKategorieBlur(member: Member, event: React.FocusEvent<HTMLInputElement>) {
    const value = event.target.value.trim();
    const next = value || null;
    if (next === member.kategorie) return;
    startTransition(async () => {
      try {
        await updateMemberKategorieAction(member.id, next);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Ändern der Kategorie.");
      }
    });
  }

  function handleDeleteSelected() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteMembersAction([...selectedIds]);
        setSelectedIds(new Set());
        setShowDeleteConfirm(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Löschen.");
        setShowDeleteConfirm(false);
      }
    });
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "");

  function sortableHeader(label: string, key: SortKey) {
    return (
      <button
        type="button"
        onClick={() => handleSortClick(key)}
        style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
      >
        {label}
        {sortIndicator(key)}
      </button>
    );
  }

  const columns: TableColumn<Member>[] = [
    {
      key: "select",
      header: (
        <input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Alle auswählen" />
      ),
      render: (m) => (
        <input
          type="checkbox"
          checked={selectedIds.has(m.id)}
          onChange={() => toggleSelect(m.id)}
          aria-label={`${m.vorname} ${m.nachname} auswählen`}
        />
      ),
    },
    {
      key: "name",
      header: sortableHeader("Name", "name"),
      // The way into a member, matching how an order is opened from its number.
      render: (m) => (
        <Link href={`/admin/members/${m.id}`} className={styles.orderLink}>
          {m.vorname} {m.nachname}
        </Link>
      ),
    },
    { key: "email", header: sortableHeader("E-Mail", "email"), render: (m) => m.email },
    {
      key: "kategorie",
      header: sortableHeader("Kategorie", "kategorie"),
      render: (m) => (
        <input
          key={m.id}
          type="text"
          defaultValue={m.kategorie ?? ""}
          placeholder="–"
          onBlur={(e) => handleKategorieBlur(m, e)}
          className={styles.inlineEdit}
        />
      ),
    },
    {
      key: "karten",
      header: sortableHeader("Karten", "karten"),
      // Counted from the cards themselves, so deactivating or adding one shows
      // up here immediately - the creation-time figures no longer would.
      render: (m) =>
        m.cards.active === 0 ? (
          "–"
        ) : (
          <>
            {m.cards.active}
            {m.cards.transferable > 0 && (
              <span style={{ color: "var(--color-text-secondary)" }}> ({m.cards.transferable} übertragbar)</span>
            )}
          </>
        ),
    },
    { key: "versandzahl", header: "Versand", render: (m) => sendSummary(m) },
    {
      key: "status",
      header: sortableHeader("Status", "versand"),
      render: (m) => {
        const state = SEND_STATE[memberSendState(m)];
        return <Badge variant={state.variant}>{state.label}</Badge>;
      },
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Mitglieder</h1>
      </div>
      {error && <p style={{ color: "var(--color-error-text)", marginBottom: "var(--space-4)" }}>{error}</p>}

      {/* Compact here only: the order overview keeps the roomier tiles, so this
          list gets to the table sooner without changing that page. */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryTile} data-size="compact">
          <span className={styles.summaryValue}>{members.length}</span>
          <span className={styles.summaryLabel}>Mitglieder</span>
        </div>
        <div className={styles.summaryTile} data-size="compact" data-tone={openCards > 0 ? "accent" : undefined}>
          <span className={styles.summaryValue}>{openCards}</span>
          <span className={styles.summaryLabel}>Karten zu versenden</span>
        </div>
        <div className={styles.summaryTile} data-size="compact" data-tone="success">
          <span className={styles.summaryValue}>{sentCards}</span>
          <span className={styles.summaryLabel}>Karten versendet</span>
        </div>
        <div className={styles.summaryTile} data-size="compact">
          <span className={styles.summaryValue}>{noCardCount}</span>
          <span className={styles.summaryLabel}>Ohne Karte</span>
        </div>
      </div>

      {filterBar}

      <div className={styles.toolbar}>
        <div className={styles.toolbarActions}>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
            Mitglied hinzufügen
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowCsvImport(true)}>
            CSV importieren
          </Button>
        </div>
      </div>

      {csvResultMessage && <p className={styles.successMessage}>{csvResultMessage}</p>}
      {sendResult && (
        <p
          className={
            sendResult.tone === "success"
              ? styles.successMessage
              : sendResult.tone === "warning"
                ? styles.warningMessage
                : styles.errorMessage
          }
        >
          {sendResult.text}
        </p>
      )}

      {selectedIds.size > 0 && (
        <div className={styles.selectionBar}>
          <span>
            <strong>{selectedIds.size}</strong> ausgewählt
          </span>
          <Button
            type="button"
            size="sm"
            disabled={selectedOpenCards === 0}
            onClick={() => setShowSendForm(true)}
          >
            {selectedOpenCards} Karte(n) versenden
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(true)}>
            Löschen
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
            Auswahl aufheben
          </Button>
        </div>
      )}

      {visibleMembers.length === 0 ? (
        <p className={styles.emptyState}>
          {members.length === 0
            ? "Keine Mitglieder für diese Auswahl. Filter zurücksetzen oder über „CSV importieren“ die Vereinsliste laden."
            : "Keine Mitglieder für diese Auswahl."}
        </p>
      ) : (
        <Table caption="Mitglieder" columns={columns} rows={visibleMembers} getRowKey={(m) => m.id} />
      )}

      <Modal open={showCsvImport} onClose={() => { setShowCsvImport(false); handleCsvCancel(); }} title="CSV-Import">
        {!csvContent ? (
          <div className={styles.form}>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Spalten: Vorname, Name, Email, Kategorie, Mitgliederkarte (ja/nein), Anzahl übertragbare Codes. Die
              Zuordnung der Spalten kannst du im nächsten Schritt prüfen und anpassen.
            </p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvFileChange} />
          </div>
        ) : (
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
                onClick={handleCsvPlan}
              >
                Weiter
              </Button>
              <Button type="button" variant="secondary" onClick={handleCsvCancel}>
                Andere Datei wählen
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Step three, and only when there is something to decide: every row whose
          member number is already in the database, with what is there and what the
          file wants, so nobody is duplicated or overwritten unseen. */}
      <Modal
        open={csvPlan !== null}
        onClose={() => setCsvPlan(null)}
        title="Bereits vorhandene Mitglieder"
      >
        {csvPlan && (
          <div className={styles.form}>
            <p style={{ color: "var(--color-text-secondary)" }}>
              {csvPlan.matches.length} {csvPlan.matches.length === 1 ? "Zeile betrifft ein Mitglied" : "Zeilen betreffen Mitglieder"},
              das es bereits gibt. Angehakte werden aktualisiert, nicht angehakte bleiben unverändert.
              {csvPlan.newCount > 0 && ` ${csvPlan.newCount} neue Mitglieder werden in jedem Fall angelegt.`}
            </p>

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCsvSelected(new Set(csvPlan.matches.map((m) => m.externalId)))}
              >
                Alle auswählen
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setCsvSelected(new Set())}>
                Alle ignorieren
              </Button>
            </div>

            <div className={styles.csvConflictList}>
              {csvPlan.matches.map((match) => {
                const nameChanged =
                  match.csv.vorname !== match.current.vorname || match.csv.nachname !== match.current.nachname;
                const kategorieChanged = (match.csv.kategorie ?? "") !== (match.current.kategorie ?? "");
                const cardsChanged =
                  match.csv.personal !== match.current.personal || match.csv.transferable !== match.current.transferable;

                return (
                  <label key={match.externalId} className={styles.csvConflictRow}>
                    <input
                      type="checkbox"
                      checked={csvSelected.has(match.externalId)}
                      onChange={() => toggleCsvRow(match.externalId)}
                    />
                    <div>
                      <strong>
                        ID {match.externalId} · {match.csv.vorname} {match.csv.nachname}
                      </strong>
                      <div className={styles.csvConflictDetail}>{match.csv.email}</div>
                      {nameChanged && (
                        <div className={styles.csvConflictDetail}>
                          Name: {match.current.vorname} {match.current.nachname} → {match.csv.vorname} {match.csv.nachname}
                        </div>
                      )}
                      {kategorieChanged && (
                        <div className={styles.csvConflictDetail}>
                          Kategorie: {match.current.kategorie ?? "–"} → {match.csv.kategorie ?? "–"}
                        </div>
                      )}
                      <div className={styles.csvConflictDetail}>
                        Karten: {match.current.personal} persönlich / {match.current.transferable} übertragbar
                        {cardsChanged ? ` → ${match.csv.personal} / ${match.csv.transferable}` : " (unverändert)"}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className={styles.actions}>
              <Button type="button" disabled={isPending} onClick={handleCsvImport}>
                Importieren
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCsvPlan(null)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showAddForm} onClose={() => setShowAddForm(false)} title="Mitglied erfassen">
        <form onSubmit={handleCreateMember} className={styles.form}>
          <div className={styles.formRow}>
            <Input label="Vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} required />
            <Input label="Name" value={nachname} onChange={(e) => setNachname(e.target.value)} required />
          </div>
          <Input label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="z.B. Funktionär, Spieler" />
          <div className={styles.formRow}>
            <Input
              label="Anzahl persönliche Karten"
              type="number"
              min={0}
              value={personalCount}
              onChange={(e) => setPersonalCount(parseInt(e.target.value, 10) || 0)}
            />
            <Input
              label="Anzahl übertragbare Karten"
              type="number"
              min={0}
              value={transferableCount}
              onChange={(e) => setTransferableCount(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-small-size)", margin: 0 }}>
            Beide auf 0 lassen, wenn das Mitglied vorerst keine Karte bekommt - Karten lassen sich jederzeit im Mitglied
            selbst hinzufügen.
          </p>
          <div className={styles.actions}>
            <Button type="submit" disabled={isPending}>
              Erfassen und Karte(n) generieren
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)}>
              Abbrechen
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Mitglieder löschen">
        <p style={{ marginBottom: "var(--space-5)" }}>
          {selectedIds.size} {selectedIds.size === 1 ? "Mitglied" : "Mitglieder"} aus der Liste löschen? Bereits
          erstellte Bestellungen und Tickets bleiben davon unberührt - es wird nur der Mitglieder-Eintrag entfernt.
        </p>
        <div className={styles.actions}>
          <Button type="button" onClick={handleDeleteSelected} disabled={isPending}>
            Löschen
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowDeleteConfirm(false)}>
            Abbrechen
          </Button>
        </div>
      </Modal>

      <Modal open={showSendForm} onClose={() => setShowSendForm(false)} title="Karten versenden">
        <div className={styles.form}>
          <p style={{ color: "var(--color-text-secondary)" }}>
            {selectedOpenCards} noch nicht versendete Karte(n) an {selectedSendableIds.length} ausgewählte Mitglieder.
            Bereits versendete Karten werden nicht erneut angehängt. Platzhalter <code>{"{{vorname}}"}</code> und{" "}
            <code>{"{{nachname}}"}</code> stehen zur Verfügung.
          </p>
          <Input label="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label className={styles.textareaLabel}>
            Nachricht
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={styles.textarea} />
          </label>
          <Input
            label='Zum Bestätigen "Versenden" eingeben'
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <div className={styles.actions}>
            <Button onClick={handleSend} disabled={isPending || !matchesSendConfirmation(confirmation) || selectedOpenCards === 0}>
              {selectedOpenCards} Karte(n) jetzt versenden
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowSendForm(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
