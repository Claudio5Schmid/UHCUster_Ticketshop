import { getGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON } from "@/lib/season";
import { DashboardView } from "./DashboardView";

export const metadata = { title: "Dashboard - Admin" };

export default async function DashboardPage() {
  const games = await getGamesForSeason(CURRENT_SEASON);

  return (
    <div>
      <h1>Dashboard</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Wähle ein oder mehrere Spiele, um die Besucherzahlen nach Kategorie zu sehen - oder öffne ein einzelnes Spiel
        für die Live-Ansicht (gescannt/ausstehend/abgelehnt in Echtzeit).
      </p>
      <DashboardView games={games} />
    </div>
  );
}
