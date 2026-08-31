"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { lookupOrder } from "./actions";
import styles from "./meine-tickets.module.css";

export function LookupForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    try {
      const result = await lookupOrder(String(formData.get("orderNumber") ?? ""), String(formData.get("email") ?? ""));
      if (result.path) {
        router.push(result.path);
        return;
      }
      setError(result.error);
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <Input
        name="orderNumber"
        label="Bestellnummer"
        placeholder="UHCU-2627-0001"
        hint="Steht in deiner Bestellbestätigung."
        required
        autoComplete="off"
        spellCheck={false}
      />
      <Input
        name="email"
        type="email"
        label="E-Mail-Adresse"
        placeholder="name@example.com"
        hint="Die Adresse, mit der du bestellt hast."
        required
        autoComplete="email"
      />
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Wird gesucht …" : "Bestellung anzeigen"}
      </Button>
    </form>
  );
}
