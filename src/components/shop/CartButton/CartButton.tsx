"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import styles from "./CartButton.module.css";

/**
 * The header's cart. With something in it, it opens the drawer rather than
 * navigating - the usual behaviour, and it keeps the customer on the page they
 * were reading. Empty, there is nothing to show in a drawer, so it stays a plain
 * link to /warenkorb and that page explains the cart is empty.
 */
export function CartButton() {
  const { lines, openCart } = useCart();

  const icon = (
    <>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M2.5 5h2l1.2 8.4a1.5 1.5 0 0 0 1.5 1.3h6.6a1.5 1.5 0 0 0 1.5-1.3l1-6.4H6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="17.5" r="1" fill="currentColor" />
        <circle cx="14" cy="17.5" r="1" fill="currentColor" />
      </svg>
      {lines.length > 0 && <span className={styles.cartCount}>{lines.length}</span>}
    </>
  );

  if (lines.length === 0) {
    return (
      <Link href="/warenkorb" className={styles.cartButton} aria-label="Warenkorb, 0 Artikel">
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={styles.cartButton}
      aria-label={`Warenkorb, ${lines.length} Artikel`}
      onClick={openCart}
    >
      {icon}
    </button>
  );
}
