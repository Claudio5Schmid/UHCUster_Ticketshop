"use client";

import { useState, useTransition } from "react";
import { updateContactEmailAction, type EmailTarget } from "@/app/admin/(protected)/email-actions";
import styles from "./EditableEmail.module.css";

interface EditableEmailProps {
  value: string;
  target: EmailTarget;
  /** Rendered above the value where the surrounding block does not label it itself
   *  - the order detail labels its own fields, the member detail does not. */
  label?: string;
}

/**
 * The address the office most often has to correct: a member writes it down wrong
 * on paper, or the club list carries an old one, and until now the only way to fix
 * it was a re-import of the whole file.
 *
 * Shown as plain text with a quiet "Ändern" beside it rather than a permanent input:
 * these pages are read far more often than edited, and a page of live fields invites
 * the accidental keystroke. Saving writes both copies of the address - see
 * contact-email.ts.
 */
export function EditableEmail({ value, target, label }: EditableEmailProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateContactEmailAction(target, draft);
        setEditing(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Adresse konnte nicht gespeichert werden.");
      }
    });
  }

  if (!editing) {
    return (
      <div className={styles.row}>
        {label && <span className={styles.label}>{label}</span>}
        <span className={styles.value}>{value || "–"}</span>
        <button type="button" className={styles.action} onClick={open}>
          Ändern
        </button>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      {label && <span className={styles.label}>{label}</span>}
      <input
        type="email"
        className={styles.input}
        value={draft}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          // Enter saves and Escape abandons, so a one-field edit never needs the mouse.
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") setEditing(false);
        }}
      />
      <button type="button" className={styles.action} onClick={save} disabled={isPending}>
        {isPending ? "Speichert..." : "Speichern"}
      </button>
      <button type="button" className={styles.action} onClick={() => setEditing(false)} disabled={isPending}>
        Abbrechen
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
