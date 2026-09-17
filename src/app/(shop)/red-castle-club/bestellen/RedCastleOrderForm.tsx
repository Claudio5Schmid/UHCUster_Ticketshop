"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { TurnstileWidget, type TurnstileState } from "@/components/shop/TurnstileWidget/TurnstileWidget";
import { formatRappenAsChf } from "@/lib/pricing";
import { getTicketAccentColor } from "@/lib/tier-colors";
import { resolveTicketName } from "@/lib/tickets/ticket-name";
import { CURRENT_SEASON_LABEL } from "@/lib/season";
import type { Product } from "@/lib/products";
import { submitRedCastleOrder, type RedCastleOrderConfirmation } from "./actions";
import kasse from "../../kasse/kasse.module.css";
import styles from "./bestellen.module.css";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

const TURNSTILE_MESSAGES: Record<TurnstileState, string> = {
  unconfigured:
    "Die Sicherheitsprüfung ist auf dieser Seite nicht eingerichtet, deshalb können wir die Bestellung nicht entgegennehmen. Bitte melde dich beim Vereinsbüro.",
  loading: "Bitte warte, bis die Sicherheitsprüfung geladen ist.",
  ready: "",
  error: "Die Sicherheitsprüfung konnte nicht geladen werden. Prüfe deine Internetverbindung und versuche es erneut.",
  expired: "Die Sicherheitsprüfung ist abgelaufen. Bitte starte sie neu.",
};

/** One star per VIP level, in the metal - the printed card's own rule (D59). */
const STAR_COUNT: Record<string, number> = { Gold: 3, Silber: 2, Bronze: 1 };

const STAR_PATH = "M10 1l2.47 5.9 6.38.51-4.86 4.16 1.49 6.23L10 14.47 4.52 17.8l1.49-6.23L1.15 7.41l6.38-.51z";

/**
 * The Red Castle Club order form (brief §2.1, D70, D76): the person ordering,
 * an optional company, the billing address, an optional reference, and the
 * payment terms as a required tick. Only what the invoice and the card need
 * (DSG, D72) - no cardholders, because every card is made out to the company
 * or the person (D73).
 *
 * The summary is the pass itself, drawn like the printed one, and the name on
 * it follows what is typed - so the rule that picks it is shown rather than
 * explained.
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

  // The three fields the pass reads from, held here so it can follow the typing.
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const includedPasses = product.benefits?.included_passes ?? 1;
  const transferable = product.benefits?.transferable ?? false;
  const colors = getTicketAccentColor(product.type, product.tier_level);
  const stars = STAR_COUNT[colors.metalName ?? ""] ?? 0;
  const tierWord = colors.metalName ?? product.name.replace(/^Red Castle Club\s*/i, "");
  const passName = resolveTicketName({ category: "red_castle", companyName, firstName, lastName });

  const tierStyle = {
    "--tier": colors.accentHex,
    "--tier-ink": colors.inkHex,
    "--tier-tint": colors.tintHex,
  } as CSSProperties;

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
      <div className={kasse.page} style={tierStyle}>
        <Container>
          <div className={kasse.confirmation}>
            <div className={kasse.confirmationHead}>
              <span className={kasse.successMark} aria-hidden="true">
                ✓
              </span>
              <h1 className={kasse.confirmationTitle}>Vielen Dank für deine Bestellung</h1>
            </div>
            <p className={kasse.confirmationLead}>Wir haben deine Bestellung erhalten, {confirmation.billingName}.</p>
            <p className={kasse.orderNumber}>
              Bestellnummer <span className={kasse.orderNumberValue}>{confirmation.orderNumber}</span>
            </p>

            <div className={kasse.confirmationList}>
              <div className={kasse.summaryLine}>
                <span>
                  {confirmation.productName} · {confirmation.quantity} {confirmation.quantity === 1 ? "Karte" : "Karten"} auf «
                  {confirmation.ticketName}»
                </span>
                <span>{formatRappenAsChf(confirmation.totalRappen)}</span>
              </div>
              <div className={kasse.summaryTotal}>
                <span>Total</span>
                <span>{formatRappenAsChf(confirmation.totalRappen)}</span>
              </div>
            </div>

            <div className={kasse.nextSteps}>
              <h2 className={kasse.nextStepsTitle}>Wie es weitergeht</h2>
              <ol className={kasse.nextStepsList}>
                <li>
                  Das Büro des UHC Uster sendet dir die Rechnung und deine Karten innert 2 bis 4 Werktagen per E-Mail an{" "}
                  <strong>{confirmation.customerEmail}</strong>.
                </li>
                <li>Du überweist den Betrag innert 30 Tagen mit der Bestellnummer als Referenz.</li>
                <li>Sobald die Karten unterwegs sind, findest du sie jederzeit auch über den Link unten.</li>
              </ol>
            </div>

            <div className={kasse.ticketPanel}>
              <h2 className={kasse.nextStepsTitle}>Deine Bestellung</h2>
              <p className={kasse.ticketPanelText}>
                Über diesen Button kommst du jederzeit zu deiner Bestellung - und zu deinen Karten, sobald das Büro sie dir geschickt hat.
                Alternativ findest du sie im Ticketportal unter <strong>Meine Tickets</strong>, mit deiner Bestellnummer.
              </p>
              <Button as="a" href={confirmation.statusPath} variant="accent" shape="pill" className={kasse.ticketPanelAction}>
                Zu meiner Bestellung
              </Button>
            </div>

            <div className={kasse.confirmationActions}>
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
    <div className={styles.page} style={tierStyle}>
      <Container>
        <div className={styles.shell}>
          <header className={styles.header}>
            <span className={styles.eyebrow}>Bestellung auf Rechnung</span>
          </header>

          <div className={styles.layout}>
            <div className={styles.main}>
              <h1 className={styles.title}>{product.name} bestellen</h1>
              <p className={styles.lead}>
                Deine {includedPasses === 1 ? "Karte wird" : `${includedPasses} Karten werden`} sofort ausgestellt. Rechnung und Karten
                kommen innert 2 bis 4 Werktagen per E-Mail vom Büro des UHC Uster, zahlbar innert 30 Tagen.
              </p>

              <form ref={formRef} onSubmit={handleSubmit} className={styles.formColumn}>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Bestellende Person</legend>
                <div className={styles.grid}>
                  <Input
                    name="firstName"
                    label="Vorname"
                    required
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                  <Input
                    name="lastName"
                    label="Nachname"
                    required
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                  <Input
                    name="email"
                    type="email"
                    label="E-Mail"
                    placeholder="name@example.com"
                    required
                    autoComplete="email"
                    className={styles.span2}
                  />
                  <Input name="phone" type="tel" label="Telefon (optional)" placeholder="079 000 00 00" autoComplete="tel" className={styles.span2} />
                </div>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Firma (optional)</legend>
                <div className={styles.grid}>
                  <Input
                    name="companyName"
                    label="Firma"
                    placeholder="Muster AG"
                    autoComplete="organization"
                    className={styles.span2}
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    hint={
                      transferable
                        ? "Mit einer Firma lauten Karten und Rechnung auf die Firma, sonst auf deinen Namen."
                        : "Mit einer Firma lautet die Rechnung auf die Firma."
                    }
                  />
                  <Input
                    name="customerReference"
                    label="Eure Referenz / PO-Nummer (optional)"
                    hint="Wird auf der Rechnung aufgeführt."
                    className={styles.span2}
                  />
                </div>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Rechnungsadresse</legend>
                <div className={styles.grid}>
                  <Input
                    name="addressStreet"
                    label="Strasse und Nr."
                    placeholder="Musterstrasse 1"
                    required
                    autoComplete="street-address"
                    className={styles.span2}
                  />
                  <div className={styles.zipCity}>
                    <Input name="addressZip" label="PLZ" placeholder="8610" required autoComplete="postal-code" inputMode="numeric" />
                    <Input name="addressCity" label="Ort" placeholder="Uster" required autoComplete="address-level2" />
                  </div>
                </div>
              </fieldset>

              <div className={kasse.turnstile}>
                <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onStateChange={handleTurnstile} resetSignal={turnstileAttempt} />
                {(turnstile === "unconfigured" || turnstile === "error" || turnstile === "expired") && (
                  <div className={kasse.turnstileProblem} role="alert">
                    <p>{TURNSTILE_MESSAGES[turnstile]}</p>
                    {turnstile !== "unconfigured" && (
                      <button type="button" className={kasse.retryButton} onClick={retryTurnstile}>
                        Erneut versuchen
                      </button>
                    )}
                  </div>
                )}
              </div>

              <label className={styles.terms}>
                <input type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required />
                <span>
                  Ich bestelle auf Rechnung und bezahle den Betrag innert <strong>30 Tagen netto</strong> nach Erhalt der Rechnung. Es gelten
                  die{" "}
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

              <p className={styles.footnote}>
                Keine Onlinezahlung. Deine Angaben verwenden wir für Rechnung und Karten, mehr dazu im{" "}
                <a href="/datenschutz" target="_blank" rel="noopener noreferrer">
                  Datenschutz
                </a>
                .
              </p>
              </form>
            </div>

            <aside className={styles.aside} aria-label="Dein Paket">
              {/* The pass being ordered, drawn like the printed one. */}
              <div className={styles.pass}>
                <div className={styles.passBody}>
                  <span className={styles.crest} aria-hidden="true" />

                  <span className={styles.passLabel}>Saisonkarte {CURRENT_SEASON_LABEL}</span>
                  <h2 className={styles.passTitle}>
                    Red Castle Club{" "}
                    <span className={styles.passTier}>
                      {tierWord}
                      {stars > 0 && (
                        <span className={styles.stars} aria-hidden="true">
                          {Array.from({ length: stars }, (_, index) => (
                            <svg key={index} width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                              <path d={STAR_PATH} />
                            </svg>
                          ))}
                        </span>
                      )}
                    </span>
                  </h2>

                  <span className={styles.watermark} aria-hidden="true">
                    {CURRENT_SEASON_LABEL}
                  </span>

                  <p className={`${styles.passName} ${passName ? "" : styles.passNamePlaceholder}`}>
                    {passName ?? "Firma oder dein Name"}
                  </p>
                  <span className={styles.passNameCaption}>Name auf {includedPasses === 1 ? "der Karte" : "den Karten"}</span>
                </div>

                <div className={styles.passStub}>
                  <span className={styles.stubCount}>{includedPasses}</span>
                  <span className={styles.stubLabel}>{includedPasses === 1 ? "Karte" : "Karten"}</span>
                </div>
              </div>

              <div className={styles.priceRow}>
                <span className={styles.priceLabel}>Total</span>
                <span className={styles.price}>{formatRappenAsChf(product.price_rappen)}</span>
              </div>

              {product.benefits?.highlights && product.benefits.highlights.length > 0 && (
                <ul className={styles.benefits}>
                  {product.benefits.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
              )}

              <Link href="/red-castle-club" className={styles.switchLink}>
                Anderes Paket wählen
              </Link>
            </aside>
          </div>
        </div>
      </Container>
    </div>
  );
}
