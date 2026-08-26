import { getGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON } from "@/lib/season";
import { ScannerLogin } from "./ScannerLogin";

export default async function ScannerLoginPage() {
  const games = await getGamesForSeason(CURRENT_SEASON);
  return <ScannerLogin games={games} />;
}
