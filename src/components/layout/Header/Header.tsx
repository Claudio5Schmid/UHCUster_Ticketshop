import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import styles from "./Header.module.css";

interface HeaderProps {
  /** Static for now - Phase 4 wires this up to real cart state. */
  cartCount?: number;
}

export function Header({ cartCount = 0 }: HeaderProps) {
  return (
    <header className={styles.header}>
      <Container>
        <div className={styles.bar}>
          <Link href="/" className={styles.logoLink} aria-label="UHC Uster - Startseite">
            <Image
              src="/uhc-uster-logo.png"
              alt="UHC Uster"
              width={160}
              height={57}
              className={styles.logo}
              priority
            />
          </Link>
          <button type="button" className={styles.cartButton} aria-label={`Warenkorb, ${cartCount} Artikel`}>
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
            {cartCount > 0 && <span className={styles.cartCount}>{cartCount}</span>}
          </button>
        </div>
      </Container>
    </header>
  );
}
