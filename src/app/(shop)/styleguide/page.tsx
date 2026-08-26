"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container/Container";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import { Input } from "@/components/ui/Input/Input";
import { Select } from "@/components/ui/Select/Select";
import { Modal } from "@/components/ui/Modal/Modal";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { useToast } from "@/components/ui/Toast/Toast";
import { TIER_MAX } from "@/lib/tier";
import styles from "./styleguide.module.css";

const colorTokens = [
  { name: "--color-bg", value: "#ffffff" },
  { name: "--color-bg-alt", value: "#fafafa" },
  { name: "--color-text", value: "#111111" },
  { name: "--color-text-secondary", value: "#6b6b6b" },
  { name: "--color-accent", value: "#e4032e" },
  { name: "--color-dark", value: "#111111" },
];

const typeTokens = [
  { label: "H1 / 68", el: <h1>Saisonkarten 26/27</h1> },
  { label: "H2 / 44", el: <h2>Red Castle Club</h2> },
  { label: "H3 / 22", el: <h3>Erwachsener</h3> },
  { label: "Body / 18", el: <p>Die Saisonkarte gilt für alle Heimspiele der laufenden Saison.</p> },
  { label: "Small / 14", el: <p style={{ fontSize: "var(--text-small-size)" }}>Rechnung folgt per Post oder E-Mail.</p> },
  { label: "Micro / 12", el: <p style={{ fontSize: "var(--text-micro-size)" }}>Bestellnummer UHCU-2627-0001</p> },
];

interface SampleOrder {
  orderNumber: string;
  customer: string;
  status: "neu" | "rechnung_versendet" | "bezahlt" | "storniert";
  amount: string;
}

const sampleOrders: SampleOrder[] = [
  { orderNumber: "UHCU-2627-0001", customer: "M. Muster", status: "neu", amount: "CHF 150.00" },
  { orderNumber: "UHCU-2627-0002", customer: "A. Beispiel", status: "bezahlt", amount: "CHF 5000.00" },
  { orderNumber: "UHCU-2627-0003", customer: "S. Test", status: "storniert", amount: "CHF 80.00" },
];

const orderColumns: TableColumn<SampleOrder>[] = [
  { key: "orderNumber", header: "Bestellnummer", render: (row) => row.orderNumber },
  { key: "customer", header: "Kunde", render: (row) => row.customer },
  {
    key: "status",
    header: "Status",
    render: (row) => (
      <Badge variant={row.status === "bezahlt" ? "accent" : row.status === "storniert" ? "outline" : "neutral"}>
        {row.status}
      </Badge>
    ),
  },
  { key: "amount", header: "Betrag", render: (row) => row.amount },
];

export default function StyleguidePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const { showToast } = useToast();

  return (
    <div>
      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Design-System</span>
            <h1>Styleguide</h1>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "60ch" }}>
              Alle Design-Tokens und Basis-Komponenten an einem Ort, inklusive der
              stufenabhängigen Preis-Darstellung. Kein Farbwert existiert ausserhalb von
              src/styles/tokens.css.
            </p>
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Farben</span>
            <h2>Colors</h2>
          </div>
          <div className={styles.swatchGrid}>
            {colorTokens.map((token) => (
              <div key={token.name}>
                <div className={styles.swatch} style={{ background: token.value }} />
                <div className={styles.swatchName}>{token.name}</div>
                <div className={styles.swatchLabel}>{token.value}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Typografie</span>
            <h2>Type scale</h2>
          </div>
          {typeTokens.map((token) => (
            <div key={token.label} className={styles.typeSample}>
              <span className={styles.typeLabel}>{token.label}</span>
              <div>{token.el}</div>
            </div>
          ))}
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Buttons</span>
            <h2>Button</h2>
          </div>
          <div className={styles.row}>
            <Button variant="primary">Tickets sichern</Button>
            <Button variant="secondary">Mehr erfahren</Button>
            <Button variant="primary" size="sm">
              Klein
            </Button>
            <Button variant="primary" disabled>
              Deaktiviert
            </Button>
            <Button as="a" href="#" variant="secondary">
              Als Link
            </Button>
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Status</span>
            <h2>Badge</h2>
          </div>
          <div className={styles.row}>
            <Badge variant="neutral">neu</Badge>
            <Badge variant="accent">bezahlt</Badge>
            <Badge variant="outline">storniert</Badge>
            <Badge variant="neutral" dot>
              Live
            </Badge>
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Formulare</span>
            <h2>Input &amp; Select</h2>
          </div>
          <div className={styles.formGrid}>
            <Input label="Name" placeholder="Vorname Nachname" />
            <Input label="E-Mail" placeholder="name@example.com" hint="Für die Rechnungsstellung." />
            <Input label="Telefon" defaultValue="079 000 00 00" error="Bitte eine gültige Nummer angeben." />
            <Select label="Karteninhaber-Anrede" defaultValue="">
              <option value="" disabled>
                Bitte wählen
              </option>
              <option value="herr">Herr</option>
              <option value="frau">Frau</option>
            </Select>
          </div>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Übersicht</span>
            <h2>Table</h2>
          </div>
          <Table caption="Beispiel-Bestellungen" columns={orderColumns} rows={sampleOrders} getRowKey={(row) => row.orderNumber} />
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Overlays</span>
            <h2>Modal &amp; Toast</h2>
          </div>
          <div className={styles.row}>
            <Button onClick={() => setModalOpen(true)}>Modal öffnen</Button>
            <Button variant="secondary" onClick={() => showToast("Änderung gespeichert.")}>
              Toast auslösen
            </Button>
            <Button variant="secondary" onClick={() => showToast("Das hat nicht geklappt.", "error")}>
              Fehler-Toast auslösen
            </Button>
          </div>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Bestellung stornieren">
            <p style={{ marginBottom: "var(--space-5)" }}>
              Soll diese Bestellung wirklich storniert werden? Diese Aktion wird protokolliert.
            </p>
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={() => {
                  setModalOpen(false);
                  showToast("Bestellung storniert.");
                }}
              >
                Stornieren
              </Button>
            </div>
          </Modal>
        </Container>
      </section>

      <section className={styles.section}>
        <Container>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Preisgestaltung</span>
            <h2>Tier-Abstufung (tier_level)</h2>
            <p style={{ color: "var(--color-text-secondary)", maxWidth: "60ch" }}>
              Je höher die Stufe, desto ruhiger die Darstellung: mehr Weissraum, weniger
              Akzentfarbe, ein feinerer Rahmen statt Schatten. Die Abstufung ist eine reine
              Funktion der Zahl <code>tier_level</code> - hier zur Demonstration mit
              Platzhalter-Inhalten, nicht mit echten Preisen.
            </p>
          </div>
          <div className={styles.tierGrid}>
            {Array.from({ length: TIER_MAX + 1 }, (_, tier) => (
              <div key={tier}>
                <Card
                  tier={tier}
                  eyebrow={`Stufe ${tier}`}
                  title={`Beispielprodukt ${tier}`}
                  footer={
                    <>
                      <span style={{ fontWeight: 600 }}>CHF —.–</span>
                      <Button size="sm">Auswählen</Button>
                    </>
                  }
                >
                  Platzhaltertext für die Vorteile dieser Stufe.
                </Card>
                <p className={styles.tierMeta}>tier_level = {tier}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
