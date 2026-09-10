"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { TurnstileWidget, type TurnstileState } from "@/components/shop/TurnstileWidget/TurnstileWidget";
import { CheckoutSteps } from "@/components/shop/CheckoutSteps/CheckoutSteps";
import { useCart } from "@/lib/cart";
import { formatRappenAsChf } from "@/lib/pricing";
import { submitOrder, type OrderConfirmation } from "./actions";
import styles from "./kasse.module.css";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/**
 * What to say for each way the challenge can fail to hand over a token. Only
 * "loading" is worth waiting out; the rest are told plainly, because a customer
 * staring at "bitte warte" has no way to know the wait will never end.
 */
const TURNSTILE_MESSAGES: Record<TurnstileState, string> = {
  unconfigured:
    "Die Sicherheitsprüfung ist auf dieser Seite nicht eingerichtet, deshalb können wir die Bestellung nicht entgegennehmen. Bitte melde dich beim Vereinsbüro - deine Angaben gehen dabei nicht verloren.",
  loading: "Bitte warte, bis die Sicherheitsprüfung geladen ist.",
  ready: "",
  error:
    "Die Sicherheitsprüfung konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.",
  expired: "Die Sicherheitsprüfung ist abgelaufen. Bitte starte sie neu.",
};

export default function KassePage() {
  const { lines, clear } = useCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  // The challenge reports its own state, so the page can name the failure instead
  // of calling every one of them "still loading" - see TurnstileWidget's comment.
  const [turnstile, setTurnstile] = useState<TurnstileState>("loading");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);

  const handleTurnstile = useCallback((state: TurnstileState, token: string) => {
    setTurnstile(state);
    setTurnstileToken(token);
  }, []);

  function retryTurnstile() {
    setError(null);
    setTurnstile("loading");
    setTurnstileToken("");
    setTurnstileAttempt((n) => n + 1);
  }

  const total = lines.reduce((sum, line) => sum + line.priceRappen, 0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);

    if (!turnstileToken) {
      setError(TURNSTILE_MESSAGES[turnstile] ?? TURNSTILE_MESSAGES.loading);
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
          <CheckoutSteps current={2} />
          <div className={styles.confirmation}>
            {/* Mark and heading share one line: the tick is a bullet for the sentence,
                not a badge stacked above it. */}
            <div className={styles.confirmationHead}>
              <span className={styles.successMark} aria-hidden="true">
                ✓
              </span>
              <h1 className={styles.confirmationTitle}>Vielen Dank für deine Bestellung</h1>
            </div>
            <p className={styles.confirmationLead}>Wir haben deine Bestellung erhalten, {confirmation.customerName}.</p>
            <p className={styles.orderNumber}>
              Bestellnummer <span className={styles.orderNumberValue}>{confirmation.orderNumber}</span>
            </p>

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

            <div className={styles.nextSteps}>
              <h2 className={styles.nextStepsTitle}>Wie es weitergeht</h2>
              <ol className={styles.nextStepsList}>
                <li>
                  Das Büro des UHC Uster sendet dir die Rechnung mit den Zahlungsdetails innerhalb weniger Werktage an{" "}
                  <strong>{confirmation.customerEmail}</strong>.
                </li>
                <li>Du überweist den Betrag mit der Bestellnummer als Referenz.</li>
                <li>
                  Sobald die Zahlung eingegangen ist, schicken wir dir deine Karten per E-Mail - und du findest
                  sie ab dann jederzeit in deinem Bereich im Shop.
                </li>
              </ol>
            </div>

            {/* The one thing to take away from this screen, so it gets a panel of its
                own rather than a place in a row of equal buttons. */}
            <div className={styles.ticketPanel}>
              <h2 className={styles.nextStepsTitle}>Deine Tickets</h2>
              <p className={styles.ticketPanelText}>
                Über diesen Button kommst du jederzeit zu deiner Bestellung und deinen Karten - auch später
                wieder. Alternativ findest du sie im Ticketportal unter <strong>Meine Tickets</strong>, mit
                deiner Bestellnummer.
              </p>
              <Button
                as="a"
                href={confirmation.statusPath}
                variant="accent"
                shape="pill"
                className={styles.ticketPanelAction}
              >
                Zu meinen Tickets
              </Button>
            </div>

            <div className={styles.confirmationActions}>
              <Button variant="secondary" onClick={() => window.print()}>
                Diese Seite drucken
              </Button>
              <Button as="a" href="/" variant="secondary">
                Zurück zur Startseite
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className={styles.page}>
        <Container>
          <CheckoutSteps current={1} />
          <h1>Kasse</h1>
          <p className={styles.emptyState}>
            Dein Warenkorb ist leer. <Link href="/">Zurück zur Startseite</Link>.
          </p>
        </Container>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Container>
        <CheckoutSteps current={1} />
        <h1>Kasse</h1>

        {/* Form and running total side by side, so the amount stays in view while
            the address is filled in rather than scrolling away above it. */}
        <div className={styles.layout}>
          <form ref={formRef} onSubmit={handleSubmit} className={styles.formColumn}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Kontakt</legend>
              <div className={styles.formGrid}>
                <Input name="name" label="Name" placeholder="Vorname Nachname" required autoComplete="name" />
                <Input
                  name="email"
                  type="email"
                  label="E-Mail"
                  placeholder="name@example.com"
                  required
                  autoComplete="email"
                />
                <Input name="phone" type="tel" label="Telefon" placeholder="079 000 00 00" required autoComplete="tel" />
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Rechnungsadresse</legend>
              <div className={styles.formGrid}>
                <Input
                  name="addressStreet"
                  label="Strasse und Nr."
                  placeholder="Musterstrasse 1"
                  required
                  autoComplete="street-address"
                  className={styles.fullSpan}
                />
                <Input name="addressZip" label="PLZ" placeholder="8610" required autoComplete="postal-code" />
                <Input name="addressCity" label="Ort" placeholder="Uster" required autoComplete="address-level2" />
              </div>
            </fieldset>

            <div className={styles.turnstile}>
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onStateChange={handleTurnstile}
                resetSignal={turnstileAttempt}
              />
              {/* Stated up front, not only after a click: an unconfigured or broken
                  challenge means this form cannot be sent at all, and saying so
                  before the address is typed respects the customer's time. */}
              {(turnstile === "unconfigured" || turnstile === "error" || turnstile === "expired") && (
                <div className={styles.turnstileProblem} role="alert">
                  <p>{TURNSTILE_MESSAGES[turnstile]}</p>
                  {turnstile !== "unconfigured" && (
                    <button type="button" className={styles.retryButton} onClick={retryTurnstile}>
                      Erneut versuchen
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <Button type="submit" disabled={submitting || turnstile === "unconfigured"} fullWidth>
              {submitting ? "Wird gesendet …" : "Bestellung abschicken"}
            </Button>
            <p className={styles.reassurance}>
              Keine Onlinezahlung: du erhältst die Rechnung per E-Mail und bezahlst per Überweisung.
            </p>
          </form>

          <aside className={styles.summary} aria-label="Bestellübersicht">
            <h2 className={styles.summaryTitle}>Deine Bestellung</h2>
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
            <Link href="/warenkorb" className={styles.editLink}>
              Warenkorb bearbeiten
            </Link>
          </aside>
        </div>
      </Container>
    </div>
  );
}
