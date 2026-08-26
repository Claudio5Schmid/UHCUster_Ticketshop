import { Button } from "@/components/ui/Button/Button";
import { CURRENT_SEASON_LABEL } from "@/lib/season";

export const metadata = { title: "Export - Admin" };

export default function AdminExportPage() {
  return (
    <div>
      <h1>Export</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Exportiert alle Bestellungen der Saison {CURRENT_SEASON_LABEL} als Excel-Datei, mit Kundendaten und
        Bestellpositionen auf zwei separaten Tabellenblättern.
      </p>
      <Button as="a" href="/admin/export/download">
        Als Excel-Datei herunterladen
      </Button>
    </div>
  );
}
