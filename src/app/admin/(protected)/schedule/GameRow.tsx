"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { setGameEventfrogUrl } from "./actions";
import type { AdminGame } from "@/lib/admin/schedule";
import styles from "../admin.module.css";

export function GameRow({ game }: { game: AdminGame }) {
  const [url, setUrl] = useState(game.eventfrog_url ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await setGameEventfrogUrl(game.id, url.trim());
        setSaved(true);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <div className={styles.inlineForm}>
      <Input
        label="Eventfrog-Link"
        value={url}
        onChange={(event) => {
          setUrl(event.target.value);
          setSaved(false);
        }}
        placeholder="https://eventfrog.ch/..."
      />
      <Button variant="secondary" size="sm" onClick={handleSave} disabled={isPending}>
        Speichern
      </Button>
      {saved && !error && <span style={{ color: "var(--color-text-secondary)" }}>Gespeichert.</span>}
      {error && <span style={{ color: "var(--color-error-text)" }}>{error}</span>}
    </div>
  );
}
