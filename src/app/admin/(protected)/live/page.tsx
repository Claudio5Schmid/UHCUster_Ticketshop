import Link from "next/link";
import { getGamesForSeason } from "@/lib/games";
import { CURRENT_SEASON } from "@/lib/season";
import styles from "../admin.module.css";

export const metadata = { title: "Live-Ansicht - Admin" };

const dateFormatter = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" });

export default async function LiveIndexPage() {
  const games = await getGamesForSeason(CURRENT_SEASON);

  return (
    <div>
      <h1>Live-Ansicht</h1>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Wähle ein Spiel, um gescannte, ausstehende und abgelehnte Tickets live zu sehen.
      </p>
      <div className={styles.copyBlock}>
        {games.map((game) => (
          <div key={game.id}>
            <Link href={`/admin/live/${game.id}`} className={styles.orderLink}>
              {dateFormatter.format(new Date(game.played_at))} - UHC Uster vs. {game.opponent}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
