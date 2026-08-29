"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Modal } from "@/components/ui/Modal/Modal";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import {
  createMemberAction,
  importCsvAction,
  sendPendingCardsAction,
  updateMemberKategorieAction,
  deleteMembersAction,
} from "./actions";
import type { Member } from "@/lib/admin/members";
import { CSV_FIELDS, parseCsvHeader, detectColumnMapping, type CsvColumnMapping, type CsvField } from "@/lib/csv/memberCsv";
import styles from "../admin.module.css";

type SortKey = "name" | "email" | "kategorie" | "karte" | "uebertragbar";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

const DEFAULT_SUBJECT = "Deine Mitgliederkarte UHC Uster";
const DEFAULT_BODY = `Hallo {{vorname}},

im Anhang findest du deine Mitgliederkarte(n) für die Saison 26/27 als PDF.

Sportliche Grüsse
UHC Uster`;

/** Sent is the finished state (green); "ready to send" is the one that wants action
 * from the office (amber); no card at all is simply inert. */
function statusFor(member: Member): { label: string; variant: "neutral" | "warning" | "success" } {
  if (!member.order_id) return { label: "Keine Karte", variant: "neutral" };
  if (member.cards_sent_at) {
    return { label: `Versendet ${dateFormatter.format(new Date(member.cards_sent_at))}`, variant: "success" };
  }
  return { label: "Bereit zum Versand", variant: "warning" };
}

export function MembersPageClient({ members, pendingCount }: { members: Member[]; pendingCount: number }) {
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
  const [mitgliederkarte, setMitgliederkarte] = useState(true);
  const [transferableCount, setTransferableCount] = useState(0);

  // CSV import - a file is read client-side first so the admin can confirm/fix
  // the column mapping before anything is actually imported.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping>({});
  const [csvResultMessage, setCsvResultMessage] = useState<string | null>(null);

  // Batch send - sendTarget null means "every pending member" (the toolbar's count);
  // a specific id list means "just this selection".
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [confirmation, setConfirmation] = useState("");
  const [sendResultMessage, setSendResultMessage] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<string[] | null>(null);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const sentCount = members.filter((m) => m.cards_sent_at).length;
  const noCardCount = members.filter((m) => !m.order_id).length;

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
        setShowCsvImport(false);
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
        const result = await sendPendingCardsAction(subject, body, confirmation, sendTarget ?? undefined);
        setSendResultMessage(
          `${result.sent} E-Mails versendet.` +
            (result.failed.length > 0 ? ` ${result.failed.length} fehlgeschlagen: ${result.failed.map((f) => `${f.email} (${f.reason})`).join("; ")}` : "")
        );
        setConfirmation("");
        setShowSendForm(false);
        setSendTarget(null);
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
      case "karte":
        return member.mitgliederkarte ? 1 : 0;
      case "uebertragbar":
        return member.transferable_code_count;
    }
  }

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = members;
    if (query) {
      result = result.filter((m) =>
        `${m.vorname} ${m.nachname} ${m.email} ${m.kategorie ?? ""}`.toLowerCase().includes(query)
      );
    }
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [members, search, sortKey, sortDirection]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedPendingIds = members.filter((m) => selectedIds.has(m.id) && m.order_id && !m.cards_sent_at).map((m) => m.id);

  const allVisibleSelected = visibleMembers.length > 0 && visibleMembers.every((m) => selectedIds.has(m.id));
  const someVisibleSelected = visibleMembers.some((m) => selectedIds.has(m.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleMembers.forEach((m) => next.delete(m.id));
        return next;
      }
      const next = new Set(prev);
      visibleMembers.forEach((m) => next.add(m.id));
      return next;
    });
  }

  function handleKategorieBlur(member: Member, event: React.FocusEvent<HTMLInputElement>) {
    const value = event.target.value.trim();
    const kategorie = value || null;
    if (kategorie === member.kategorie) return;
    startTransition(async () => {
      try {
        await updateMemberKategorieAction(member.id, kategorie);
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

  const sendCount = sendTarget ? sendTarget.length : pendingCount;

  const columns: TableColumn<Member>[] = [
    {
      key: "select",
      header: (
        <input
          ref={selectAllRef}
          type="checkbox"
          checked={allVisibleSelected}
          onChange={toggleSelectAll}
          aria-label="Alle auswählen"
        />
      ),
      render: (m) => <input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} aria-label={`${m.vorname} ${m.nachname} auswählen`} />,
    },
    { key: "name", header: sortableHeader("Name", "name"), render: (m) => `${m.vorname} ${m.nachname}` },
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
    { key: "karte", header: sortableHeader("Karte", "karte"), render: (m) => (m.mitgliederkarte ? "Ja" : "Nein") },
    {
      key: "uebertragbar",
      header: sortableHeader("Übertragbar", "uebertragbar"),
      render: (m) => m.transferable_code_count,
    },
    {
      key: "status",
      header: "Status",
      render: (m) => {
        const status = statusFor(m);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      key: "dateien",
      header: "Dateien",
      render: (m) =>
        m.order_number ? (
          <a href={`/admin/orders/${m.order_number}`} target="_blank" rel="noopener noreferrer" className={styles.orderLink}>
            Ansehen
          </a>
        ) : (
          "–"
        ),
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Mitglieder</h1>
      </div>
      {error && <p style={{ color: "var(--color-error-text)", marginBottom: "var(--space-4)" }}>{error}</p>}

      <div className={styles.summaryGrid}>
        <div className={styles.summaryTile}>
          <span className={styles.summaryValue}>{members.length}</span>
          <span className={styles.summaryLabel}>Mitglieder</span>
        </div>
        <div className={styles.summaryTile} data-tone={pendingCount > 0 ? "accent" : undefined}>
          <span className={styles.summaryValue}>{pendingCount}</span>
          <span className={styles.summaryLabel}>Karten zu versenden</span>
        </div>
        <div className={styles.summaryTile} data-tone="success">
          <span className={styles.summaryValue}>{sentCount}</span>
          <span className={styles.summaryLabel}>Karten versendet</span>
        </div>
        <div className={styles.summaryTile}>
          <span className={styles.summaryValue}>{noCardCount}</span>
          <span className={styles.summaryLabel}>Ohne Karte</span>
        </div>
      </div>

      {/* One toolbar instead of four stacked sections: search stays put, and the three
          actions that used to each own a full-height block are now buttons opening a
          dialog - so the member list itself is visible without scrolling past forms. */}
      <div className={styles.toolbar}>
        <div className={styles.searchField}>
          <Input label="Suche" placeholder="Name, E-Mail oder Kategorie" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className={styles.toolbarActions}>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddForm(true)}>
            Mitglied hinzufügen
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowCsvImport(true)}>
            CSV importieren
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setSendTarget(null);
              setShowSendForm(true);
            }}
            disabled={pendingCount === 0}
          >
            {pendingCount} Karte(n) versenden
          </Button>
        </div>
      </div>

      {csvResultMessage && <p className={styles.successMessage}>{csvResultMessage}</p>}
      {sendResultMessage && <p className={styles.successMessage}>{sendResultMessage}</p>}

      {selectedIds.size > 0 && (
        <div className={styles.selectionBar}>
          <span>
            <strong>{selectedIds.size}</strong> ausgewählt
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={selectedPendingIds.length === 0}
            onClick={() => {
              setSendTarget(selectedPendingIds);
              setShowSendForm(true);
            }}
          >
            An Ausgewählte senden ({selectedPendingIds.length})
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
            ? "Noch keine Mitglieder erfasst. Über „CSV importieren“ die Vereinsliste laden."
            : "Keine Mitglieder für diese Suche."}
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
                onClick={handleCsvImport}
              >
                Importieren
              </Button>
              <Button type="button" variant="secondary" onClick={handleCsvCancel}>
                Andere Datei wählen
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
          <div className={styles.formRow}>
            <Input label="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)} placeholder="z.B. Funktionär, Spieler" />
            <Input
              label="Anzahl übertragbare Codes"
              type="number"
              min={0}
              value={transferableCount}
              onChange={(e) => setTransferableCount(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={mitgliederkarte} onChange={(e) => setMitgliederkarte(e.target.checked)} />
            Mitgliederkarte (persönlich, nicht übertragbar)
          </label>
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

      <Modal
        open={showSendForm}
        onClose={() => {
          setShowSendForm(false);
          setSendTarget(null);
        }}
        title="Karten versenden"
      >
        <div className={styles.form}>
          <p style={{ color: "var(--color-text-secondary)" }}>
            {sendTarget
              ? `${sendCount} ausgewählte Mitglieder warten auf den Versand ihrer Karte(n).`
              : `${sendCount} Mitglieder warten auf den Versand ihrer Karte(n).`}{" "}
            Nachricht kann vor dem Versand angepasst werden - Platzhalter <code>{"{{vorname}}"}</code> und{" "}
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
            <Button onClick={handleSend} disabled={isPending || confirmation !== "Versenden" || sendCount === 0}>
              {sendCount} Karte(n) jetzt versenden
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowSendForm(false);
                setSendTarget(null);
              }}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
