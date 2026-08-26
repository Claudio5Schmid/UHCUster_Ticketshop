import { notFound } from "next/navigation";
import { getGamesForSeason } from "@/lib/games";
import { getLiveGameStats } from "@/lib/admin/live";
import { CURRENT_SEASON } from "@/lib/season";
import { LiveStatsView } from "./LiveStatsView";

export const metadata = { title: "Live-Ansicht - Admin" };

export default async function LiveGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const games = await getGamesForSeason(CURRENT_SEASON);
  const game = games.find((g) => g.id === gameId);
  if (!game) {
    notFound();
  }

  const stats = await getLiveGameStats(gameId);
  const label = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(game.played_at)
  );

  return (
    <div>
      <h1>
        UHC Uster vs. {game.opponent} <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>({label})</span>
      </h1>
      <LiveStatsView gameId={gameId} initialStats={stats} />
    </div>
  );
}
