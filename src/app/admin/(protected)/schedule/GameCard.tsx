"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import {
  setGameEventfrogUrl,
  setGameScannerCode,
  updateGameDetails,
  clearGameManualOverride,
} from "./actions";
import type { AdminGame } from "@/lib/admin/schedule";
import { Matchup } from "@/components/match/Matchup/Matchup";
import styles from "./schedule.module.css";

const dateFormatter = new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich",
  dateStyle: "full",
  timeStyle: "short",
});

/** ISO -> the `YYYY-MM-DDTHH:mm` a datetime-local input needs, in the browser's own
 * timezone so what the admin sees in the field matches what's displayed above it. */
function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

export function GameCard({ game }: { game: AdminGame }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  const [url, setUrl] = useState(game.eventfrog_url ?? "");
  const [code, setCode] = useState(game.scanner_code ?? "");

  const [opponent, setOpponent] = useState(game.opponent);
  const [playedAt, setPlayedAt] = useState(toDateTimeLocal(game.played_at));
  const [venue, setVenue] = useState(game.venue ?? "");

  const linksDirty = url.trim() !== (game.eventfrog_url ?? "") || code.trim() !== (game.scanner_code ?? "");

  function run(work: () => Promise<void>, successText: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
        setMessage({ text: successText, tone: "ok" });
      } catch (error) {
        setMessage({
          text: error instanceof Error ? error.message : "Fehler beim Speichern.",
          tone: "error",
        });
      }
    });
  }

  function handleSaveLinks() {
    run(async () => {
      if (url.trim() !== (game.eventfrog_url ?? "")) await setGameEventfrogUrl(game.id, url.trim());
      if (code.trim() !== (game.scanner_code ?? "")) await setGameScannerCode(game.id, code.trim());
    }, "Gespeichert.");
  }

  function handleSaveDetails() {
    run(async () => {
      await updateGameDetails(game.id, { opponent, playedAt, venue });
      setEditingDetails(false);
    }, "Spieldaten angepasst.");
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.opponent}>
            {/* Name kept alongside the crests - this is the screen where an admin
                edits that very name, so it has to stay readable. */}
            <Matchup opponent={game.opponent} size="sm" showName />
          </h3>
          <p className={styles.meta}>
            {dateFormatter.format(new Date(game.played_at))}
            {game.venue ? ` · ${game.venue}` : ""}
          </p>
        </div>
        <div className={styles.badges}>
          {game.scanner_code ? (
            <Badge variant="success">Scanner bereit</Badge>
          ) : (
            <Badge variant="neutral">Kein Scanner-Code</Badge>
          )}
          {game.eventfrog_url ? (
            <Badge variant="info">Eventfrog verlinkt</Badge>
          ) : (
            <Badge variant="warning">Kein Ticketlink</Badge>
          )}
          {game.manual_override && <Badge variant="outline">Manuell angepasst</Badge>}
        </div>
      </header>

      <div className={styles.fieldRow}>
        <Input
          label="Eventfrog-Link"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://eventfrog.ch/..."
        />
        <Input
          label="Scanner-Code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Codewort für die Helfer"
        />
        <Button variant="secondary" size="sm" onClick={handleSaveLinks} disabled={isPending || !linksDirty}>
          Speichern
        </Button>
      </div>

      {editingDetails ? (
        <div className={styles.detailsEditor}>
          <div className={styles.fieldRow}>
            <Input label="Gegner" value={opponent} onChange={(event) => setOpponent(event.target.value)} />
            <Input
              label="Datum und Zeit"
              type="datetime-local"
              value={playedAt}
              onChange={(event) => setPlayedAt(event.target.value)}
            />
            <Input label="Ort" value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="Buchholz" />
          </div>
          <p className={styles.hint}>
            Von Hand angepasste Spiele werden bei der nächsten Synchronisation nicht mehr von Swiss Unihockey
            überschrieben.
          </p>
          <div className={styles.detailActions}>
            <Button size="sm" onClick={handleSaveDetails} disabled={isPending}>
              Spieldaten speichern
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditingDetails(false)} disabled={isPending}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.detailActions}>
          <button type="button" className={styles.linkButton} onClick={() => setEditingDetails(true)}>
            Spieldaten bearbeiten
          </button>
          {game.manual_override && (
            <button
              type="button"
              className={styles.linkButton}
              disabled={isPending}
              onClick={() => run(() => clearGameManualOverride(game.id), "Wird wieder synchronisiert.")}
            >
              Wieder automatisch synchronisieren
            </button>
          )}
        </div>
      )}

      {message && (
        <p className={message.tone === "error" ? styles.error : styles.success}>{message.text}</p>
      )}
    </article>
  );
}
