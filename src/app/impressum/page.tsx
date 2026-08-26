import { Container } from "@/components/layout/Container/Container";
import { PlaceholderNotice } from "@/components/shop/PlaceholderNotice/PlaceholderNotice";
import styles from "../legal.module.css";

export const metadata = {
  title: "Impressum - UHC Uster Ticketshop",
};

export default function ImpressumPage() {
  return (
    <div className={styles.page}>
      <Container>
        <PlaceholderNotice />
        <h1>Impressum</h1>
        <div className={styles.prose}>
          <p>
            Verantwortlich für diese Website: UHC Uster. Die vollständigen Angaben
            (Adresse, Vertretungsberechtigte, Kontakt, UID) folgen hier, sobald
            Claudio den definitiven Text liefert.
          </p>
        </div>
      </Container>
    </div>
  );
}
