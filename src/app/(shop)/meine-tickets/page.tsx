import type { Metadata } from "next";
import { Container } from "@/components/layout/Container/Container";
import { LookupForm } from "./LookupForm";
import styles from "./meine-tickets.module.css";

export const metadata: Metadata = {
  title: "Meine Tickets - UHC Uster Ticketshop",
  description: "Status deiner Bestellung ansehen und deine Karten herunterladen.",
};

export default function MeineTicketsPage() {
  return (
    <div className={styles.page}>
      <Container>
        <div className={styles.wrap}>
          <span className={styles.eyebrow}>Meine Tickets</span>
          <h1>Bestellung anzeigen</h1>
          <p className={styles.lead}>
            Den direkten Link zu deiner Bestellung findest du in der Bestellbestätigung, die wir dir per
            E-Mail geschickt haben. Wenn du ihn nicht mehr hast, kommst du hier mit deiner Bestellnummer
            wieder hin.
          </p>
          <LookupForm />
        </div>
      </Container>
    </div>
  );
}
