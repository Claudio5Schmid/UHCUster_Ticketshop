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
          </div>
          <div className={styles.bottom}>&copy; {year} UHC Uster</div>
        </div>
      </Container>
    </footer>
  );
}
