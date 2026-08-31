"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Select } from "@/components/ui/Select/Select";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { PieChart } from "@/components/ui/PieChart/PieChart";
import { Matchup } from "@/components/match/Matchup/Matchup";
import { getAttendanceReportAction } from "./actions";
import type { Game } from "@/lib/games";
import type { AttendanceReport, GameAttendanceRow } from "@/lib/admin/dashboard";
import styles from "../admin.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  dateStyle: "medium",
  timeStyle: "short",
});

const ALL_GAMES = "__all__";

interface DisplayRow extends GameAttendanceRow {
  isTotal?: boolean;
}

export function DashboardView({ games, initialReport }: { games: Game[]; initialReport: AttendanceReport }) {
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState<string>(ALL_GAMES);
  const [report, setReport] = useState<AttendanceReport>(initialReport);
  const [error, setError] = useState<string | null>(null);

  // Every selection change reloads immediately - no "show results" button to press.
  // Fetching from the change handler rather than an effect keyed on `selection`
  // also drops a round trip on mount: the default selection is "all games", which
  // is exactly what the server already rendered into `initialReport`.
  function handleSelectionChange(next: string) {
    setSelection(next);
    const gameIds = next === ALL_GAMES ? games.map((game) => game.id) : [next];
    setError(null);
    startTransition(async () => {
      try {
        setReport(await getAttendanceReportAction(gameIds));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Fehler beim Laden.");
      }
    });
  }

  const byProductSlices = useMemo(
    () => Object.entries(report.grandTotalByProduct).map(([label, value]) => ({ label, value })),
    [report]
  );

  const byCategorySlices = useMemo(
    () => Object.entries(report.grandTotalByCategory).map(([label, value]) => ({ label, value })),
    [report]
  );

  // Colors pinned: here green/red mean "good/bad", not just "category A/B".
  const scanQualitySlices = useMemo(
    () => [
      { label: "Angenommen", value: report.grandTotal, color: "var(--color-success-text)" },
      { label: "Abgelehnt", value: report.grandTotalRejected, color: "var(--color-accent)" },
    ],
    [report]
  );

  const byGameSlices = useMemo(
    () =>
      report.games.map((game) => ({
        label: `vs. ${game.opponent}`,
        value: game.totalAccepted,
      })),
    [report]
  );

  const displayRows: DisplayRow[] = [
    ...report.games,
    ...(report.games.length > 1
      ? [
          {
            gameId: "__total__",
            opponent: "",
            playedAt: "",
            totalAccepted: report.grandTotal,
            totalRejected: report.grandTotalRejected,
            byProduct: report.grandTotalByProduct,
            isTotal: true,
          },
        ]
      : []),
  ];

  const columns: TableColumn<DisplayRow>[] = [
    {
      key: "game",
      header: "Spiel",
      render: (row) =>
        row.isTotal ? (
          <strong>Total</strong>
        ) : (
          <Link
            href={`/admin/dashboard/${row.gameId}`}
            className={styles.orderLink}
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}
          >
            {dateFormatter.format(new Date(row.playedAt))}
            <Matchup opponent={row.opponent} size="sm" showName />
          </Link>
        ),
    },
    ...report.productNames.map((name) => ({
      key: name,
      header: name,
      render: (row: DisplayRow) => row.byProduct[name] ?? 0,
    })),
    { key: "total", header: "Total", render: (row) => row.totalAccepted },
    { key: "rejected", header: "Abgelehnte Scans", render: (row) => row.totalRejected },
  ];

  const hasAnyScans = report.grandTotal > 0 || report.grandTotalRejected > 0;

  return (
    <div>
      <div className={styles.dashboardToolbar}>
        <Select
          label="Spiel"
          value={selection}
          onChange={(event) => handleSelectionChange(event.target.value)}
          className={styles.gameSelect}
        >
          <option value={ALL_GAMES}>Alle Spiele ({games.length})</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {dateFormatter.format(new Date(game.played_at))} - vs. {game.opponent}
            </option>
          ))}
        </Select>
        {selection !== ALL_GAMES && (
          <Link href={`/admin/dashboard/${selection}`} className={styles.liveLink}>
            Live-Ansicht für dieses Spiel →
          </Link>
        )}
      </div>

      {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}

      <div className={styles.chartGrid} data-pending={isPending ? "true" : undefined}>
        <PieChart
          title="Besucher nach Kartentyp"
          slices={byProductSlices}
          unit="Besucher"
          emptyLabel="Noch keine Scans erfasst"
        />
        <PieChart
          title="Saisonkarten vs. Red Castle Club"
          slices={byCategorySlices}
          unit="Besucher"
          emptyLabel="Noch keine Scans erfasst"
        />
        <PieChart
          title="Scan-Qualität"
          slices={scanQualitySlices}
          unit="Scans"
          emptyLabel="Noch keine Scans erfasst"
        />
        {selection === ALL_GAMES && (
          <PieChart
            title="Besucher pro Spiel"
            slices={byGameSlices}
            unit="Besucher"
            emptyLabel="Noch keine Scans erfasst"
          />
        )}
      </div>

      <div className={styles.section}>
        <h2>Besucherzahlen im Detail</h2>
        {!hasAnyScans ? (
          <p className={styles.emptyState}>
            Für diese Auswahl wurden noch keine Tickets gescannt. Sobald am Spieltag gescannt wird, erscheinen die
            Zahlen hier automatisch.
          </p>
        ) : (
          <Table
            caption="Besucherzahlen nach Spiel"
            columns={columns}
            rows={displayRows}
            getRowKey={(row) => row.gameId}
          />
        )}
      </div>
    </div>
  );
}
