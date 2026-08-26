"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { TurnstileWidget } from "@/components/shop/TurnstileWidget/TurnstileWidget";
import { useCart } from "@/lib/cart";
import { formatRappenAsChf } from "@/lib/pricing";
import { submitOrder, type OrderConfirmation } from "./actions";
import styles from "./kasse.module.css";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function KassePage() {
  const { lines, clear } = useCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);

  const total = lines.reduce((sum, line) => sum + line.priceRappen, 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

    if (!turnstileToken) {
      setError("Bitte warte, bis die Sicherheitsprüfung geladen ist.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitOrder(
        {
          name: String(formData.get("name") ?? ""),
          addressStreet: String(formData.get("addressStreet") ?? ""),
          addressZip: String(formData.get("addressZip") ?? ""),
          addressCity: String(formData.get("addressCity") ?? ""),
          email: String(formData.get("email") ?? ""),
          phone: String(formData.get("phone") ?? ""),
        },
        lines.map((line) => ({ productId: line.productId, holderName: line.holderName })),
        turnstileToken
      );
      setConfirmation(result);
      clear();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Etwas ist schiefgelaufen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmation) {
    return (
      <div className={styles.page}>
        <Container>
          <div className={styles.confirmation}>
            <h1>Bestellung eingegangen</h1>
            <p>
              Vielen Dank, {confirmation.customerName}! Deine Bestellung wurde erfasst. Notiere dir
              die Bestellnummer oder mache einen Screenshot dieser Seite:
            </p>
            <div className={styles.orderNumber}>{confirmation.orderNumber}</div>
            <div className={styles.confirmationList}>
              {confirmation.items.map((item, index) => (
                <div key={index} className={styles.summaryLine}>
                  <span>
                    {item.product_name}
                    {item.holder_name ? ` - ${item.holder_name}` : ""}
                  </span>
                  <span>{formatRappenAsChf(item.line_total_rappen)}</span>
                </div>
              ))}
              <div className={styles.summaryTotal}>
                <span>Total</span>
                <span>{formatRappenAsChf(confirmation.totalRappen)}</span>
              </div>
            </div>
            <p>
              Das Büro des UHC Uster sendet dir die Rechnung mit den Zahlungsdetails innerhalb
              weniger Werktage an <strong>{confirmation.customerEmail}</strong> zu. Deine Karte(n)
              erhältst du, sobald die Zahlung eingegangen ist.
            </p>
            <Button variant="secondary" onClick={() => window.print()} style={{ marginTop: "var(--space-5)" }}>
              Diese Seite drucken
            </Button>
          </div>
        </Container>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className={styles.page}>
        <Container>
          <h1>Kasse</h1>
          <p style={{ marginTop: "var(--space-5)", color: "var(--color-text-secondary)" }}>
            Dein Warenkorb ist leer. <Link href="/">Zurück zur Startseite</Link>.
          </p>
        </Container>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Container>
        <h1>Kasse</h1>

        <div className={styles.summary}>
          {lines.map((line) => (
            <div key={line.id} className={styles.summaryLine}>
              <span>
                {line.productName}
                {line.holderName ? ` - ${line.holderName}` : ""}
              </span>
              <span>{line.priceRappen === 0 ? "Gratis" : formatRappenAsChf(line.priceRappen)}</span>
            </div>
          ))}
          <div className={styles.summaryTotal}>
            <span>Total</span>
            <span>{formatRappenAsChf(total)}</span>
          </div>
        </div>

        <form ref={formRef} onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <Input name="name" label="Name" placeholder="Vorname Nachname" required />
            <Input name="email" type="email" label="E-Mail" placeholder="name@example.com" required />
            <Input name="phone" type="tel" label="Telefon" placeholder="079 000 00 00" required />
            <Input name="addressStreet" label="Strasse und Nr." placeholder="Musterstrasse 1" required />
            <Input name="addressZip" label="PLZ" placeholder="8610" required />
            <Input name="addressCity" label="Ort" placeholder="Uster" required />
          </div>

          <div className={styles.turnstile}>
            <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Wird gesendet …" : "Bestellung abschicken"}
          </Button>
        </form>
      </Container>
    </div>
  );
}
