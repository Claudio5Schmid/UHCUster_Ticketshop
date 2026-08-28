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

export function AdminsPageClient({ admins }: { admins: AdminUser[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [removingAdmin, setRemovingAdmin] = useState<AdminUser | null>(null);

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    startTransition(async () => {
      try {
        await createAdminAction(email, password);
        setEmail("");
        setPassword("");
        setPasswordConfirm("");
        setShowAddForm(false);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Erstellen.");
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
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              label="Passwort bestätigen"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <div className={styles.actions}>
              <Button type="submit" disabled={isPending}>
                Konto erstellen
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowAddForm(false)}>
                Abbrechen
              </Button>
            </div>
          </form>
        )}
      </div>

      <Modal open={!!removingAdmin} onClose={() => setRemovingAdmin(null)} title="Admin entfernen">
        <p style={{ marginBottom: "var(--space-5)" }}>
          Zugriff für {removingAdmin?.email} entfernen? Das Konto selbst bleibt bestehen, verliert aber sofort den
          Zugriff auf den Admin-Bereich.
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
