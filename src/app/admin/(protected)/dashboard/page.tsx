import { getGamesForSeason } from "@/lib/games";
import { getAttendanceReport } from "@/lib/admin/dashboard";
import { CURRENT_SEASON } from "@/lib/season";
import { DashboardView } from "./DashboardView";

export const metadata = { title: "Dashboard - Admin" };

export default async function DashboardPage() {
  const games = await getGamesForSeason(CURRENT_SEASON);
  // All games are shown by default, so the first report is rendered server-side
  // rather than after a round trip from the client.
  const initialReport = await getAttendanceReport(games.map((game) => game.id));

  return (
    <div>
      <h1>Dashboard</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Besucherzahlen aller Heimspiele - über die Auswahl auf ein einzelnes Spiel einschränken, oder die Live-Ansicht
        eines Spiels öffnen (gescannt/ausstehend/abgelehnt in Echtzeit).
      </p>
      <DashboardView games={games} initialReport={initialReport} />
    </div>
  );
}
