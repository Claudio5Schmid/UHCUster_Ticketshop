"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Modal } from "@/components/ui/Modal/Modal";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { createAdminAction, removeAdminAction } from "./actions";
import type { AdminUser } from "@/lib/admin/admins";
import styles from "../admin.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

const PASSWORD_MISMATCH = "Die Passwörter stimmen nicht überein.";

export function AdminsPageClient({ admins }: { admins: AdminUser[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /* Kept apart from `error` above, which belongs to the removal dialog and renders at
     the top of the page. A message about this form shown up there is a message nobody
     reads: the form sits below the admin list, so the mismatch warning appeared off
     screen and the create looked like it had silently done nothing. */
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [removingAdmin, setRemovingAdmin] = useState<AdminUser | null>(null);

  /** Closing the form empties it, whether that was a successful create or Abbrechen -
   *  reopening it used to hand the next admin the previous one's address and password
   *  still sitting in the fields. */
  function closeAddForm() {
    setShowAddForm(false);
    setEmail("");
    setPassword("");
    setPasswordConfirm("");
    setFormError(null);
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (password !== passwordConfirm) {
      setFormError(PASSWORD_MISMATCH);
      return;
    }
    if (password.length < 8) {
      setFormError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    startTransition(async () => {
      try {
        await createAdminAction(email, password);
        closeAddForm();
      } catch (submitError) {
        setFormError(submitError instanceof Error ? submitError.message : "Fehler beim Erstellen.");
      }
    });
  }

  function handleRemoveConfirm() {
    if (!removingAdmin) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeAdminAction(removingAdmin.user_id);
        setRemovingAdmin(null);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Entfernen.");
        setRemovingAdmin(null);
      }
    });
  }

  const columns: TableColumn<AdminUser>[] = [
    { key: "email", header: "E-Mail", render: (a) => a.email },
    { key: "created_at", header: "Erstellt", render: (a) => dateFormatter.format(new Date(a.created_at)) },
    {
      key: "actions",
      header: "",
      render: (a) => (
        <button
          type="button"
          onClick={() => setRemovingAdmin(a)}
          style={{
            all: "unset",
            cursor: "pointer",
            color: "var(--color-error-text)",
            textDecoration: "underline",
            fontSize: "var(--text-small-size)",
          }}
        >
          Entfernen
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Admins</h1>
      </div>
      {error && <p style={{ color: "var(--color-error-text)", marginBottom: "var(--space-4)" }}>{error}</p>}

      <div className={styles.section}>
        <h2>Admin-Liste</h2>
        <Table caption="Admins" columns={columns} rows={admins} getRowKey={(a) => a.user_id} />
      </div>

      <div className={styles.section}>
        <div className={styles.header}>
          <h2>Admin hinzufügen</h2>
          {!showAddForm && (
            <Button type="button" variant="secondary" onClick={() => setShowAddForm(true)}>
              Admin hinzufügen
            </Button>
          )}
        </div>
        {showAddForm && (
          <form onSubmit={handleCreate} className={styles.form}>
            <Input label="E-Mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              label="Passwort"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFormError(null);
              }}
              required
              minLength={8}
              autoComplete="new-password"
            />
            {/* The mismatch belongs on the field it is about, not in a banner: Input
                renders it under the box and marks it aria-invalid, so it is impossible
                to miss and screen readers announce it with the field. */}
            <Input
              label="Passwort bestätigen"
              type="password"
              value={passwordConfirm}
              onChange={(e) => {
                setPasswordConfirm(e.target.value);
                setFormError(null);
              }}
              required
              minLength={8}
              autoComplete="new-password"
              error={formError === PASSWORD_MISMATCH ? formError : undefined}
            />
            {formError && formError !== PASSWORD_MISMATCH && (
              <p style={{ color: "var(--color-error-text)", margin: 0 }}>{formError}</p>
            )}
            <div className={styles.actions}>
              <Button type="submit" disabled={isPending}>
                Konto erstellen
              </Button>
              <Button type="button" variant="secondary" onClick={closeAddForm}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </div>

      <Modal open={!!removingAdmin} onClose={() => setRemovingAdmin(null)} title="Admin entfernen">
        <p style={{ marginBottom: "var(--space-5)" }}>
          Zugriff für {removingAdmin?.email} entfernen? Das Konto wird dabei vollständig gelöscht - die Adresse ist
          danach wieder frei und kann jederzeit erneut als Admin angelegt werden.
        </p>
        <div className={styles.actions}>
          <Button type="button" onClick={handleRemoveConfirm} disabled={isPending}>
            Entfernen
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRemovingAdmin(null)}>
            Abbrechen
          </Button>
        </div>
      </Modal>
    </div>
  );
}
