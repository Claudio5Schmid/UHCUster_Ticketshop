"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button/Button";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import { getAttendanceReportAction } from "./actions";
import type { Game } from "@/lib/games";
import type { AttendanceReport, GameAttendanceRow } from "@/lib/admin/dashboard";
import styles from "../admin.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

interface DisplayRow extends GameAttendanceRow {
  isTotal?: boolean;
}

export function DashboardView({ games }: { games: Game[] }) {
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = games.length > 0 && games.every((g) => selectedIds.has(g.id));

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(games.map((g) => g.id)));
  }

  function handleShow() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await getAttendanceReportAction([...selectedIds]);
        setReport(result);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Laden.");
      }
    });
  }

  const displayRows: DisplayRow[] = report
    ? [
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
      ]
    : [];

  const columns: TableColumn<DisplayRow>[] = report
    ? [
        {
          key: "game",
          header: "Spiel",
          render: (row) =>
            row.isTotal ? (
              <strong>Total</strong>
            ) : (
              <Link href={`/admin/dashboard/${row.gameId}`} className={styles.orderLink}>
                {dateFormatter.format(new Date(row.playedAt))} - vs. {row.opponent}
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
      ]
    : [];

  return (
    <div>
      <div className={styles.section}>
        <h2>Spiele auswählen</h2>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Alle Spiele
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-4)" }}>
          {games.map((game) => (
            <label key={game.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input type="checkbox" checked={selectedIds.has(game.id)} onChange={() => toggle(game.id)} />
              {dateFormatter.format(new Date(game.played_at))} - vs. {game.opponent}
            </label>
          ))}
        </div>
        <div className={styles.actions}>
          <Button type="button" onClick={handleShow} disabled={isPending || selectedIds.size === 0}>
            Ergebnisse anzeigen
          </Button>
        </div>
        {error && <p style={{ color: "var(--color-error-text)" }}>{error}</p>}
      </div>

      {report && (
        <div className={styles.section}>
          <h2>Besucherzahlen</h2>
          {report.games.length === 0 ? (
            <p style={{ color: "var(--color-text-secondary)" }}>Keine Daten für die Auswahl.</p>
          ) : (
            <Table caption="Besucherzahlen nach Spiel" columns={columns} rows={displayRows} getRowKey={(row) => row.gameId} />
          )}
        </div>
      )}
    </div>
  );
}
