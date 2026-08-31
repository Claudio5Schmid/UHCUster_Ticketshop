import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { CartButton } from "@/components/shop/CartButton/CartButton";
import { MobileNav } from "./MobileNav";
import styles from "./Header.module.css";

export function Header() {
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
          <nav className={styles.nav} aria-label="Hauptnavigation">
            <Link href="/#saisonkarten">Saisonkarten</Link>
            <Link href="/red-castle-club">Red Castle Club</Link>
            <Link href="/spielplan">Einzeltickets</Link>
          </nav>
          <div className={styles.right}>
            <CartButton />
            <MobileNav />
          </div>
        </div>
      </Container>
    </header>
  );
}
