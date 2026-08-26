"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { bootstrapFirstAdmin } from "@/app/admin/actions";
import styles from "@/app/admin/admin-auth.module.css";

export function SetupForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password"));
    const passwordConfirm = String(formData.get("passwordConfirm"));

    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      setSubmitting(false);
      return;
    }
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      setSubmitting(false);
      return;
    }

    const result = await bootstrapFirstAdmin(String(formData.get("email")), password);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.title}>Erstes Admin-Konto einrichten</div>
      <p className={styles.hint}>
        Dieses Formular funktioniert nur einmal, solange noch kein Admin-Konto existiert.
      </p>
      <Input name="email" type="email" label="E-Mail" required autoFocus />
      <Input name="password" type="password" label="Passwort" required minLength={8} />
      <Input name="passwordConfirm" type="password" label="Passwort bestätigen" required minLength={8} />
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Wird erstellt …" : "Konto erstellen"}
      </Button>
    </form>
  );
}
