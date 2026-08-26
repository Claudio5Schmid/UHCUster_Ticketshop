"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { useCart } from "@/lib/cart";
import { formatRappenAsChf } from "@/lib/pricing";
import styles from "./warenkorb.module.css";

export default function WarenkorbPage() {
  const { lines, removeLine, setHolderName } = useCart();
  const router = useRouter();

  const total = lines.reduce((sum, line) => sum + line.priceRappen, 0);
  const allNamed = lines.length > 0 && lines.every((line) => line.holderName.trim().length > 0);

  return (
    <div className={styles.page}>
      <Container>
        <h1>Warenkorb</h1>

        {lines.length === 0 ? (
          <p className={styles.empty} style={{ marginTop: "var(--space-5)" }}>
            Dein Warenkorb ist leer. Wähle auf der{" "}
            <Link href="/">Startseite</Link> oder bei{" "}
            <Link href="/red-castle-club">Red Castle Club</Link> eine Karte aus.
          </p>
        ) : (
          <>
            <div className={styles.lines} style={{ marginTop: "var(--space-6)" }}>
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
                    value={line.holderName}
                    onChange={(event) => setHolderName(line.id, event.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className={styles.summary}>
              <span>Total</span>
              <span className={styles.total}>{formatRappenAsChf(total)}</span>
            </div>

            <Button onClick={() => router.push("/kasse")} disabled={!allNamed}>
              Zur Kasse
            </Button>
            {!allNamed && (
              <p className={styles.empty} style={{ marginTop: "var(--space-3)" }}>
                Bitte für jede Karte einen Namen eintragen.
              </p>
            )}
          </>
        )}
      </Container>
    </div>
  );
}
