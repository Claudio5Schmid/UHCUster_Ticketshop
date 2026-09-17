"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { TurnstileWidget, type TurnstileState } from "@/components/shop/TurnstileWidget/TurnstileWidget";
import { formatRappenAsChf } from "@/lib/pricing";
import type { Product } from "@/lib/products";
import { submitRedCastleOrder, type RedCastleOrderConfirmation } from "./actions";
import styles from "../../kasse/kasse.module.css";
import own from "./bestellen.module.css";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const TURNSTILE_MESSAGES: Record<TurnstileState, string> = {
  unconfigured:
    "Die Sicherheitsprüfung ist auf dieser Seite nicht eingerichtet, deshalb können wir die Bestellung nicht entgegennehmen. Bitte melde dich beim Vereinsbüro.",
  loading: "Bitte warte, bis die Sicherheitsprüfung geladen ist.",
  ready: "",
  error: "Die Sicherheitsprüfung konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.",
  expired: "Die Sicherheitsprüfung ist abgelaufen. Bitte starte sie neu.",
};

/**
 * The Red Castle Club order form (brief §2.1, D70, D76): the person ordering,
 * an optional company, the billing address, an optional reference, and the
 * payment terms as a required tick. Only what the invoice and the card need
 * (DSG, D72) - no cardholders, because every card is made out to the company
 * or the person (D73).
 */
export function RedCastleOrderForm({ product }: { product: Product }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<RedCastleOrderConfirmation | null>(null);
  const [turnstile, setTurnstile] = useState<TurnstileState>("loading");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const includedPasses = product.benefits?.included_passes ?? 1;
  const transferable = product.benefits?.transferable ?? false;

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? "").trim();

    if (!turnstileToken) {
      setError(TURNSTILE_MESSAGES[turnstile] ?? TURNSTILE_MESSAGES.loading);
      return;
    }
    if (!termsAccepted) {
      setError("Bitte bestätige die Zahlungsbedingungen, um zu bestellen.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitRedCastleOrder(
        {
          variant: product.variant ?? "",
          companyName: field("companyName"),
          firstName: field("firstName"),
          lastName: field("lastName"),
          email: field("email"),
          phone: field("phone"),
          addressStreet: field("addressStreet"),
          addressZip: field("addressZip"),
          addressCity: field("addressCity"),
          customerReference: field("customerReference"),
          termsAccepted,
        },
        turnstileToken
      );
      setConfirmation(result);
      window.scrollTo({ top: 0 });
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
            <div className={styles.confirmationHead}>
              <span className={styles.successMark} aria-hidden="true">
                ✓
              </span>
              <h1 className={styles.confirmationTitle}>Vielen Dank für deine Bestellung</h1>
            </div>
            <p className={styles.confirmationLead}>Wir haben deine Bestellung erhalten, {confirmation.billingName}.</p>
            <p className={styles.orderNumber}>
              Bestellnummer <span className={styles.orderNumberValue}>{confirmation.orderNumber}</span>
            </p>

            <div className={styles.confirmationList}>
              <div className={styles.summaryLine}>
                <span>
                  {confirmation.productName} · {confirmation.quantity} {confirmation.quantity === 1 ? "Karte" : "Karten"} auf «{confirmation.ticketName}»
                </span>
                <span>{formatRappenAsChf(confirmation.totalRappen)}</span>
              </div>
              <div className={styles.summaryTotal}>
                <span>Total</span>
                <span>{formatRappenAsChf(confirmation.totalRappen)}</span>
              </div>
            </div>

            <div className={styles.nextSteps}>
              <h2 className={styles.nextStepsTitle}>Wie es weitergeht</h2>
              <ol className={styles.nextStepsList}>
                <li>
                  Das Büro des UHC Uster sendet dir die Rechnung und deine Karten innert 2 bis 4 Werktagen per E-Mail an{" "}
                  <strong>{confirmation.customerEmail}</strong>.
                </li>
                <li>Du überweist den Betrag innert 30 Tagen mit der Bestellnummer als Referenz.</li>
                <li>Sobald die Karten unterwegs sind, findest du sie jederzeit auch über den Link unten.</li>
              </ol>
            </div>

            <div className={styles.ticketPanel}>
              <h2 className={styles.nextStepsTitle}>Deine Bestellung</h2>
              <p className={styles.ticketPanelText}>
                Über diesen Button kommst du jederzeit zu deiner Bestellung - und zu deinen Karten, sobald das Büro sie dir geschickt hat.
                Alternativ findest du sie im Ticketportal unter <strong>Meine Tickets</strong>, mit deiner Bestellnummer.
              </p>
              <Button as="a" href={confirmation.statusPath} variant="accent" shape="pill" className={styles.ticketPanelAction}>
                Zu meiner Bestellung
              </Button>
            </div>

            <div className={styles.confirmationActions}>
              <Button variant="secondary" onClick={() => window.print()}>
                Diese Seite drucken
              </Button>
              <Button as="a" href="/red-castle-club" variant="secondary">
                Zurück zum Red Castle Club
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Container>
        <span className={own.eyebrow}>Red Castle Club · Bestellung auf Rechnung</span>
        <h1>{product.name} bestellen</h1>

        <div className={styles.layout}>
          <form ref={formRef} onSubmit={handleSubmit} className={styles.formColumn}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Bestellende Person</legend>
              <div className={styles.formGrid}>
                <Input name="firstName" label="Vorname" required autoComplete="given-name" />
                <Input name="lastName" label="Nachname" required autoComplete="family-name" />
                <Input name="email" type="email" label="E-Mail" placeholder="name@example.com" required autoComplete="email" />
                <Input name="phone" type="tel" label="Telefon (optional)" placeholder="079 000 00 00" autoComplete="tel" />
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Firma (optional)</legend>
              <div className={styles.formGrid}>
                <Input
                  name="companyName"
                  label="Firma"
                  placeholder="Muster AG"
                  autoComplete="organization"
                  className={styles.fullSpan}
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  hint={
                    transferable
                      ? "Wenn du eine Firma angibst, lauten die Karten und die Rechnung auf die Firma - sonst auf deinen Namen."
                      : "Wenn du eine Firma angibst, lautet die Rechnung auf die Firma."
                  }
                />
                <Input
                  name="customerReference"
                  label="Eure Referenz / PO-Nummer (optional)"
                  hint="Wird auf der Rechnung aufgeführt."
                  className={styles.fullSpan}
                />
              </div>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Rechnungsadresse</legend>
              <div className={styles.formGrid}>
                <Input name="addressStreet" label="Strasse und Nr." placeholder="Musterstrasse 1" required autoComplete="street-address" className={styles.fullSpan} />
                <Input name="addressZip" label="PLZ" placeholder="8610" required autoComplete="postal-code" />
                <Input name="addressCity" label="Ort" placeholder="Uster" required autoComplete="address-level2" />
              </div>
            </fieldset>

            <div className={styles.turnstile}>
              <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onStateChange={handleTurnstile} resetSignal={turnstileAttempt} />
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

            <label className={styles.terms}>
              <input type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
              <span>
                Ich bestelle auf Rechnung und bezahle den Betrag innert <strong>30 Tagen netto</strong> nach Erhalt der Rechnung. Es gelten die{" "}
                <Link href="/ticket-bedingungen" target="_blank">
                  Ticket-Bedingungen
                </Link>
                .
              </span>
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <Button type="submit" disabled={submitting || turnstile === "unconfigured"} fullWidth>
              {submitting ? "Wird gesendet …" : "Kostenpflichtig bestellen"}
            </Button>
            <p className={styles.reassurance}>
              Keine Onlinezahlung: Rechnung und Karten kommen innert 2 bis 4 Werktagen per E-Mail vom Büro des UHC Uster. Deine Angaben
              verwenden wir nur für Rechnung und Karten (siehe{" "}
              <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
                Datenschutz
              </a>
              ).
            </p>
          </form>

          <aside className={styles.summary} aria-label="Bestellübersicht">
            <h2 className={styles.summaryTitle}>Dein Paket</h2>
            <div className={styles.summaryLine}>
              <span>{product.name}</span>
              <span>{formatRappenAsChf(product.price_rappen)}</span>
            </div>
            <p className={own.packageNote}>
              {includedPasses} {includedPasses === 1 ? "Saisonkarte" : "Saisonkarten"}
              {transferable ? ", übertragbar" : ", persönlich"}
              {companyName.trim() ? ` - auf «${companyName.trim()}»` : ""}
            </p>
            {product.benefits?.highlights && product.benefits.highlights.length > 0 && (
              <ul className={own.highlights}>
                {product.benefits.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            )}
            <div className={styles.summaryTotal}>
              <span>Total</span>
              <span>{formatRappenAsChf(product.price_rappen)}</span>
            </div>
            <Link href="/red-castle-club" className={styles.editLink}>
              Anderes Paket wählen
            </Link>
          </aside>
        </div>
      </Container>
    </div>
  );
}
