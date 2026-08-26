"use client";

import { useState } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { login } from "@/app/admin/actions";
import styles from "@/app/admin/admin-auth.module.css";

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const result = await login(String(formData.get("email")), String(formData.get("password")));
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
    // On success, login() redirects server-side - no further client handling needed.
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <Image src="/uhc-uster-logo.png" alt="UHC Uster" width={140} height={50} />
        <div className={styles.title}>Admin-Login</div>
        <Input name="email" type="email" label="E-Mail" required autoFocus />
        <Input name="password" type="password" label="Passwort" required />
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Wird geprüft …" : "Anmelden"}
        </Button>
      </form>
    </div>
  );
}
