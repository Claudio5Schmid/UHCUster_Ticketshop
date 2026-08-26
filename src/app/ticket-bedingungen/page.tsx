import { Container } from "@/components/layout/Container/Container";
import { PlaceholderNotice } from "@/components/shop/PlaceholderNotice/PlaceholderNotice";
import styles from "../legal.module.css";

export const metadata = {
  title: "Ticket-Bedingungen - UHC Uster Ticketshop",
};

export default function TicketBedingungenPage() {
  return (
    <div className={styles.page}>
      <Container>
        <PlaceholderNotice />
        <h1>Ticket-Bedingungen</h1>
        <div className={styles.prose}>
          <p>
            Hier stehen die Bedingungen für Saisonkarten und Red-Castle-Club-Karten:
            Gültigkeit, Übertragbarkeit, was bei einem verlorenen Ticket passiert und
            wie eine Bestellung storniert werden kann. Der definitive Text folgt.
          </p>
        </div>
      </Container>
    </div>
  );
}
