"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { CheckoutSteps } from "@/components/shop/CheckoutSteps/CheckoutSteps";
import { useCart } from "@/lib/cart";
import { formatRappenAsChf } from "@/lib/pricing";
import styles from "./warenkorb.module.css";

export default function WarenkorbPage() {
  const { lines, removeLine, setHolderName } = useCart();
  const router = useRouter();

  const total = lines.reduce((sum, line) => sum + line.priceRappen, 0);
  const allNamed = lines.length > 0 && lines.every((line) => line.holderName.trim().length > 0);
  const missingNames = lines.filter((line) => line.holderName.trim().length === 0).length;

  return (
    <div className={styles.page}>
      <Container>
        <CheckoutSteps current={0} />
        <h1>Warenkorb</h1>

        {lines.length === 0 ? (
          <p className={styles.empty} style={{ marginTop: "var(--space-5)" }}>
            Dein Warenkorb ist leer. Wähle auf der <Link href="/">Startseite</Link> oder bei{" "}
            <Link href="/red-castle-club">Red Castle Club</Link> eine Karte aus.
          </p>
        ) : (
          <div className={styles.layout}>
            <div className={styles.lines}>
              {lines.map((line) => (
                <div key={line.id} className={styles.line}>
                  <div className={styles.lineHeader}>
                    <div>
                      <div className={styles.lineTitle}>{line.productName}</div>
                      <div className={styles.linePrice}>
                        {line.priceRappen === 0 ? "Gratis" : formatRappenAsChf(line.priceRappen)}
                      </div>
                    </div>
                    <button type="button" className={styles.removeButton} onClick={() => removeLine(line.id)}>
                      Entfernen
                    </button>
                  </div>
                  <Input
                    label={line.transferable ? "Name (z.B. Firma)" : "Name Karteninhaber:in"}
                    placeholder={line.transferable ? "Firma Muster AG" : "Vorname Nachname"}
                    hint={
                      line.transferable
                        ? "Dieser Name steht auf allen Karten dieses Pakets."
                        : "Dieser Name wird auf die Karte gedruckt."
                    }
                    value={line.holderName}
                    onChange={(event) => setHolderName(line.id, event.target.value)}
                  />
                </div>
              ))}
            </div>

            <aside className={styles.summary} aria-label="Zusammenfassung">
              <h2 className={styles.summaryTitle}>Zusammenfassung</h2>
              <div className={styles.summaryRow}>
                <span>
                  {lines.length} {lines.length === 1 ? "Karte" : "Karten"}
                </span>
                <span>{formatRappenAsChf(total)}</span>
              </div>
              <div className={styles.summaryTotal}>
                <span>Total</span>
                <span className={styles.total}>{formatRappenAsChf(total)}</span>
              </div>

              <Button onClick={() => router.push("/kasse")} disabled={!allNamed} fullWidth>
                Zur Kasse
              </Button>
              {!allNamed && (
                <p className={styles.hint}>
                  Noch {missingNames} {missingNames === 1 ? "Name" : "Namen"} eintragen, dann geht es weiter.
                </p>
              )}
              <Link href="/" className={styles.continueLink}>
                Weitere Karten hinzufügen
              </Link>
            </aside>
          </div>
        )}
      </Container>
    </div>
  );
}
