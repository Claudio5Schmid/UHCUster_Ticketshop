import { getGamesForSeason } from "@/lib/games";
import { pickDefaultGameId } from "@/lib/scanner/default-game";
import { CURRENT_SEASON } from "@/lib/season";
import { ScannerLogin } from "./ScannerLogin";

// Rendered per request, not prerendered. Two reasons, both about match day: the
// game list has to include a fixture added or rescheduled since the last deploy,
// and the pre-selection below is "which game is today", which a build-time render
// would freeze at whatever the answer was when the build ran.
export const dynamic = "force-dynamic";

export default async function ScannerLoginPage() {
  const games = await getGamesForSeason(CURRENT_SEASON);
  // Picked on the server so the client never recomputes it and the markup can't
  // disagree with itself on hydration.
  const defaultGameId = pickDefaultGameId(games);

  return <ScannerLogin games={games} defaultGameId={defaultGameId} />;
}
