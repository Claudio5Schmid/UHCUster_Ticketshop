import Link from "next/link";
import { Container } from "@/components/layout/Container/Container";
import { DATENSCHUTZ_PDF, IMPRESSUM_URL } from "@/lib/legal";
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
                <a href={IMPRESSUM_URL} target="_blank" rel="noopener noreferrer">
                  Impressum
                </a>
              </li>
              {/* The club's own PDF rather than a page of its own: it is the
                  signed document, and keeping a second copy as markup would mean
                  two versions of a legal text that must not disagree. A plain
                  anchor, not next/link - this is a file, not a route - and a new
                  tab, so a half-filled order form is not lost behind it. */}
              <li>
                <a href={DATENSCHUTZ_PDF} target="_blank" rel="noopener noreferrer">
                  Datenschutz
                </a>
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
