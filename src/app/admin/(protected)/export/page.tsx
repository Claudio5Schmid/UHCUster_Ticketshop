import { Button } from "@/components/ui/Button/Button";
import { CURRENT_SEASON_LABEL } from "@/lib/season";
import styles from "../admin.module.css";

export const metadata = { title: "Export - Admin" };

export default function AdminExportPage() {
  return (
    <div>
      <h1>Export</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Exportiert alle Bestellungen der Saison {CURRENT_SEASON_LABEL} als Excel-Datei, mit Kundendaten und
        Bestellpositionen auf zwei separaten Tabellenblättern.
      </p>
      <div className={styles.actions}>
        <Button as="a" href="/admin/export/download">
          Als Excel-Datei herunterladen
        </Button>
      </div>

      <h2>Buchhaltung (FIBU)</h2>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Bezahlte Bestellungen der Saison {CURRENT_SEASON_LABEL} im Buchhaltungs-Format (Debitor, Betrag,
        Belegnummer, Datum, Konto) - das Konto-Feld ist noch leer, da das Zielsystem noch nicht feststeht
        (siehe docs/FIBU-INTERFACE.md).
      </p>
      <div className={styles.actions}>
        <Button as="a" href="/admin/export/fibu" variant="secondary">
          FIBU-CSV herunterladen
        </Button>
      </div>
    </div>
  );
}
