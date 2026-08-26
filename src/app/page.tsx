import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";

export default function Home() {
  return (
    <Container as="section">
      <div style={{ paddingBlock: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <h1>UHC Uster Ticketshop</h1>
        <p style={{ color: "var(--color-text-secondary)", maxWidth: "60ch" }}>
          Der Shop selbst entsteht in Phase 3. Das Design-System und alle Basis-Komponenten lassen
          sich bereits im Styleguide begutachten.
        </p>
        <div>
          <Button as="a" href="/styleguide">
            Zum Styleguide
          </Button>
        </div>
      </div>
    </Container>
  );
}
