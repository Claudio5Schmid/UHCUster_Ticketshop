"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Input } from "@/components/ui/Input/Input";
import { createGame } from "./actions";
import adminStyles from "../admin.module.css";

/**
 * For the fixtures Swiss Unihockey has not entered yet. The schedule arrives in
 * stages - the 2026/27 league rounds 19 to 22 were missing from the feed for weeks -
 * and a game that is not in the list can neither be sold nor scanned.
 *
 * Collapsed by default: it is the exception, and the list of real games is what the
 * page is for.
 */
export function AddGameForm() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [opponent, setOpponent] = useState("");
  const [playedAt, setPlayedAt] = useState("");
  const [venue, setVenue] = useState("Buchholz (Uster)");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setOpponent("");
    setPlayedAt("");
    setVenue("Buchholz (Uster)");
    setError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createGame({ opponent, playedAt, venue });
        close();
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Spiel konnte nicht erfasst werden.");
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Spiel von Hand erfassen
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={adminStyles.form} style={{ marginBottom: "var(--space-6)" }}>
      <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
        Für Spiele, die Swiss Unihockey noch nicht angesetzt hat. Sie werden vom Sync nie überschrieben und nie
        doppelt angelegt.
      </p>
      <Input
        label="Gegner"
        value={opponent}
        onChange={(event) => setOpponent(event.target.value)}
        placeholder="z.B. Floorball Thurgau"
        required
      />
      <Input
        label="Datum und Anspielzeit"
        type="datetime-local"
        value={playedAt}
        onChange={(event) => setPlayedAt(event.target.value)}
        required
      />
      <Input
        label="Ort"
        value={venue}
        onChange={(event) => setVenue(event.target.value)}
        hint="Leer lassen, wenn der Ort noch offen ist."
      />
      {error && <p style={{ color: "var(--color-error-text)", margin: 0 }}>{error}</p>}
      <div className={adminStyles.actions}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Wird erfasst..." : "Spiel erfassen"}
        </Button>
        <Button type="button" variant="secondary" onClick={close}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
