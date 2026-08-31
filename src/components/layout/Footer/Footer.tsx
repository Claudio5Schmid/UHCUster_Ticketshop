import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import styles from "./Footer.module.css";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.inner}>
          <div className={styles.top}>
            <div>
              <div className={styles.brand}>UHC Uster</div>
              <p className={styles.tagline}>Saisonkarten und Red Castle Club für den UHC Uster.</p>
            </div>
            <ul className={styles.linkList}>
              {/* First in the list on purpose: it is the only link here a customer
                  ever actively looks for. */}
              <li>
                <Link href="/meine-tickets">Meine Tickets</Link>
              </li>
              <li>
                <Link href="/impressum">Impressum</Link>
              </li>
              <li>
                <Link href="/datenschutz">Datenschutz</Link>
              </li>
              <li>
                <Link href="/ticket-bedingungen">Ticket-Bedingungen</Link>
              </li>
            </ul>
          </div>
          <div className={styles.bottom}>&copy; {year} UHC Uster</div>
        </div>
      </Container>
    </footer>
  );
}
