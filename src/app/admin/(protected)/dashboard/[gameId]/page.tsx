import { notFound } from "next/navigation";
import { getGamesForSeason } from "@/lib/games";
import { getLiveGameStats, getScanLogForGame } from "@/lib/admin/live";
import { CURRENT_SEASON } from "@/lib/season";
import { Matchup } from "@/components/match/Matchup/Matchup";
import { LiveStatsView } from "./LiveStatsView";
import { ScanLogTable } from "./ScanLogTable";

export const metadata = { title: "Live-Ansicht - Admin" };

export default async function LiveGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const games = await getGamesForSeason(CURRENT_SEASON);
  const game = games.find((g) => g.id === gameId);
  if (!game) {
    notFound();
  }

  const [stats, scanLog] = await Promise.all([getLiveGameStats(gameId), getScanLogForGame(gameId)]);
  const label = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(game.played_at)
  );

  return (
    <div>
      {/* Crests like the rest of the app, but the opponent's name stays: this is
          an operations screen where being sure beats recognising at a glance. */}
      <h1 style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <Matchup opponent={game.opponent} showName />
        <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>({label})</span>
      </h1>
      <LiveStatsView gameId={gameId} initialStats={stats} />
      <ScanLogTable entries={scanLog} />
    </div>
  );
}
