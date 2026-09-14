import { getAllGames } from "@/lib/admin/schedule";
import { CURRENT_SEASON } from "@/lib/season";
import { GameCard } from "./GameCard";
import { SyncButton } from "./SyncButton";
import { AddGameForm } from "./AddGameForm";
import adminStyles from "../admin.module.css";
import styles from "./schedule.module.css";

export const metadata = { title: "Spielplan - Admin" };

export default async function AdminSchedulePage() {
  const games = await getAllGames(CURRENT_SEASON);

  return (
    <div>
      <div className={adminStyles.header}>
        <h1>Spielplan</h1>
        <SyncButton />
      </div>
      <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-6)" }}>
        Heimspiele kommen automatisch von Swiss Unihockey (Datum, Zeit, Ort, Gegner) und lassen sich bei Bedarf von
        Hand korrigieren. Eventfrog-Link und Scanner-Code werden pro Spiel hier gesetzt - den Scanner-Code brauchen die
        Helfer, um sich am Spieltag unter /scanner anzumelden. Spiele, die der Verband noch nicht angesetzt hat,
        kannst du selbst erfassen.
      </p>


      {games.length === 0 ? (
        <p className={adminStyles.emptyState}>
          Für die Saison {CURRENT_SEASON} sind noch keine Spiele hinterlegt. Über &quot;Jetzt synchronisieren&quot; werden
          sie von Swiss Unihockey geladen.
        </p>
      ) : (
        <div className={styles.list}>
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* After the list, not before it: the fixtures are what the page is for, and
          entering one by hand is the exception. */}
      <div style={{ marginTop: "var(--space-6)" }}>
        <AddGameForm />
      </div>
    </div>
  );
}
