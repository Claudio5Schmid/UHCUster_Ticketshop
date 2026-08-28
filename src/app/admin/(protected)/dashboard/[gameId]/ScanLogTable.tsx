import { Badge } from "@/components/ui/Badge/Badge";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import type { ScanLogEntry } from "@/lib/admin/live";
import styles from "../../admin.module.css";

const RESULT_LABELS: Record<ScanLogEntry["result"], string> = {
  accepted: "Akzeptiert",
  already_redeemed: "Bereits eingelöst",
  invalid_signature: "Ungültige Signatur",
  not_found: "Nicht gefunden",
  wrong_game: "Falsches Spiel",
  voided: "Storniert",
};

const timeFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "medium" });

const columns: TableColumn<ScanLogEntry>[] = [
  { key: "scannedAt", header: "Zeit", render: (entry) => timeFormatter.format(new Date(entry.scannedAt)) },
  {
    key: "result",
    header: "Ergebnis",
    render: (entry) => <Badge variant={entry.result === "accepted" ? "accent" : "outline"}>{RESULT_LABELS[entry.result]}</Badge>,
  },
  { key: "holder", header: "Karteninhaber:in", render: (entry) => entry.holderName ?? "–" },
  { key: "product", header: "Produkt", render: (entry) => entry.productName ?? "–" },
  { key: "device", header: "Gerät", render: (entry) => entry.deviceId },
];

export function ScanLogTable({ entries }: { entries: ScanLogEntry[] }) {
  return (
    <div className={styles.section}>
      <h2>Scan-Protokoll</h2>
      {entries.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)" }}>Noch keine Scans für dieses Spiel.</p>
      ) : (
        <Table caption="Scan-Protokoll" columns={columns} rows={entries} getRowKey={(entry) => entry.id} />
      )}
    </div>
  );
}
