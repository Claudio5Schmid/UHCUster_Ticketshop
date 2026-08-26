import { Container } from "@/components/layout/Container/Container";
import { PlaceholderNotice } from "@/components/shop/PlaceholderNotice/PlaceholderNotice";
import styles from "../legal.module.css";

export const metadata = {
  title: "Datenschutz - UHC Uster Ticketshop",
};

export default function DatenschutzPage() {
  return (
    <div className={styles.page}>
      <Container>
        <PlaceholderNotice />
        <h1>Datenschutzerklärung</h1>
        <div className={styles.prose}>
          <p>
            Diese Seite beschreibt, welche Daten beim Bestellen einer Saisonkarte
            oder Red-Castle-Club-Karte erhoben werden (Name, Adresse, E-Mail,
            Telefon) und wozu sie verwendet werden. Der definitive Text - inklusive
            Aufbewahrungsfrist und Auskunftsrecht - folgt hier.
          </p>
        </div>
      </Container>
    </div>
  );
}
