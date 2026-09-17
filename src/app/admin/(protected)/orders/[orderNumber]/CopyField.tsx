"use client";

import { useState } from "react";
import { EditableEmail } from "@/components/admin/EditableEmail/EditableEmail";
import type { EmailTarget } from "@/app/admin/(protected)/email-actions";
import styles from "./invoice.module.css";

interface CopyFieldProps {
  label: string;
  value: string | null | undefined;
  /** Multi-line values (an address) keep their line breaks on screen and on the clipboard. */
  multiline?: boolean;
  /** Set on the address field: it becomes editable in place, keeping its label and
   *  its own copy button. The other invoice fields stay read-only - they come from
   *  the order and are not the office's to retype here. */
  editableAs?: EmailTarget;
}

/**
 * One invoice field with its own copy button (brief §2.5): the office types
 * these into the accounting software one at a time, so each is copyable on its
 * own rather than as one block that has to be picked apart.
 */
export function CopyField({ label, value, multiline, editableAs }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const text = (value ?? "").trim();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (editableAs) {
    return (
      <div className={styles.copyField}>
        <span className={styles.copyLabel}>{label}</span>
        <EditableEmail value={text} target={editableAs} />
        <button type="button" className={styles.copyButton} onClick={handleCopy} disabled={!text} aria-label={`${label} kopieren`}>
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.copyField}>
      <span className={styles.copyLabel}>{label}</span>
      <span className={multiline ? styles.copyValueMultiline : styles.copyValue}>{text || "–"}</span>
      <button type="button" className={styles.copyButton} onClick={handleCopy} disabled={!text} aria-label={`${label} kopieren`}>
        {copied ? "Kopiert" : "Kopieren"}
      </button>
    </div>
  );
}

/** The whole block at once, for an accounting form that takes a pasted address. */
export function CopyAllButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" className={styles.copyAll} onClick={handleCopy}>
      {copied ? "Kopiert" : label}
    </button>
  );
}
