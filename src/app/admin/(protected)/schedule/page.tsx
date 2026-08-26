import { getAllGames } from "@/lib/admin/schedule";
import { CURRENT_SEASON } from "@/lib/season";
import { Table, type TableColumn } from "@/components/ui/Table/Table";
import type { AdminGame } from "@/lib/admin/schedule";
import { GameRow } from "./GameRow";
import { SyncButton } from "./SyncButton";
import styles from "../admin.module.css";

export const metadata = { title: "Spielplan - Admin" };

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function AdminSchedulePage() {
  const games = await getAllGames(CURRENT_SEASON);

  const columns: TableColumn<AdminGame>[] = [
    { key: "played_at", header: "Datum", render: (game) => dateFormatter.format(new Date(game.played_at)) },
    { key: "opponent", header: "Gegner", render: (game) => game.opponent },
    { key: "venue", header: "Ort", render: (game) => game.venue ?? "–" },
    { key: "eventfrog", header: "Eventfrog-Link / Scanner-Code", render: (game) => <GameRow game={game} /> },
  ];

  return (
    <div>
      <div className={styles.header}>
        <h1>Spielplan</h1>
        <SyncButton />
      </div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Heimspiele werden automatisch von Swiss Unihockey übernommen (Datum, Zeit, Ort, Gegner). Der Eventfrog-Link
        muss manuell pro Spiel eingetragen werden. Der Scanner-Code wird den Helfern am Spieltag gegeben, damit sie
        sich unter /scanner anmelden können.
      </p>
      <Table caption="Heimspiele" columns={columns} rows={games} getRowKey={(game) => game.id} />
    </div>
  );
}
