"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button/Button";
import { useCart } from "@/lib/cart";
import { formatRappenAsChf } from "@/lib/pricing";
import styles from "./CartDrawer.module.css";

/**
 * The cart overview that slides in from the right when a card is added.
 *
 * Before it, "Auswählen" did nothing a customer could see except tick the count
 * in the header - so the shop gave no sign the card had landed, and the way on
 * was to find the cart icon. This is the usual answer: what you just added, what
 * it costs, and the two things you might want next.
 *
 * "Zur Kasse" only goes to the checkout when every card has a holder name, because
 * that is the rule /warenkorb already enforces (the name is printed on the card).
 * With a name still missing it goes to /warenkorb instead and says so, rather than
 * offering a route into a checkout that would be sent back.
 */
export function CartDrawer() {
  const { lines, removeLine, isOpen, closeCart } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const titleId = useId();

  const total = lines.reduce((sum, line) => sum + line.priceRappen, 0);
  const missingNames = lines.filter((line) => line.holderName.trim().length === 0).length;
  const allNamed = lines.length > 0 && missingNames === 0;

  // Closes on navigation. Adjusted during render rather than in an effect, the way
  // MobileNav does it, so the drawer never paints open on the page it sent you to.
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    if (isOpen) closeCart();
  }

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeCart();
    }
    document.addEventListener("keydown", onKeyDown);

    // Keeps the page behind the open drawer from scrolling under it on iOS.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, closeCart]);

  // Nothing to show before the first card goes in, and nothing left to show once
  // the checkout has cleared the cart.
  if (lines.length === 0) return null;

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={closeCart} aria-hidden="true" />}

      <aside
        className={isOpen ? `${styles.panel} ${styles.panelOpen}` : styles.panel}
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        // Keeps the closed panel out of the tab order; `hidden` would cancel the slide.
        inert={!isOpen}
      >
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Warenkorb
          </h2>
          <button type="button" className={styles.close} onClick={closeCart} aria-label="Warenkorb schliessen">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={styles.lines}>
          {lines.map((line) => (
            <div key={line.id} className={styles.line}>
              <div className={styles.lineText}>
                <div className={styles.lineTitle}>{line.productName}</div>
                <div className={line.holderName ? styles.lineHolder : styles.lineHolderMissing}>
                  {line.holderName || "Name fehlt noch"}
                </div>
              </div>
              <div className={styles.lineRight}>
                <span className={styles.linePrice}>
                  {line.priceRappen === 0 ? "Gratis" : formatRappenAsChf(line.priceRappen)}
                </span>
                <button type="button" className={styles.remove} onClick={() => removeLine(line.id)}>
                  Entfernen
                </button>
              </div>
            </div>
          ))}
        </div>

        <footer className={styles.foot}>
          <div className={styles.totalRow}>
            <span>Total</span>
            <span className={styles.total}>{formatRappenAsChf(total)}</span>
          </div>

          <Button
            fullWidth
            onClick={() => {
              closeCart();
              router.push(allNamed ? "/kasse" : "/warenkorb");
            }}
          >
            {allNamed ? "Zur Kasse" : "Namen eintragen"}
          </Button>

          {!allNamed && (
            <p className={styles.hint}>
              Noch {missingNames} {missingNames === 1 ? "Name" : "Namen"} eintragen, dann geht es weiter.
            </p>
          )}

          <button type="button" className={styles.continue} onClick={closeCart}>
            Weitere Tickets bestellen
          </button>

          {allNamed && (
            <Link href="/warenkorb" className={styles.editLink} onClick={closeCart}>
              Warenkorb bearbeiten
            </Link>
          )}
        </footer>
      </aside>
    </>
  );
}
