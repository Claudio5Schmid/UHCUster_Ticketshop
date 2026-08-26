"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { setGameEventfrogUrl, setGameScannerCode } from "./actions";
import type { AdminGame } from "@/lib/admin/schedule";
import styles from "../admin.module.css";

export function GameRow({ game }: { game: AdminGame }) {
  const [url, setUrl] = useState(game.eventfrog_url ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [code, setCode] = useState(game.scanner_code ?? "");
  const [isCodePending, startCodeTransition] = useTransition();
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeSaved, setCodeSaved] = useState(false);

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

  function handleSaveCode() {
    setCodeError(null);
    setCodeSaved(false);
    startCodeTransition(async () => {
      try {
        await setGameScannerCode(game.id, code.trim());
        setCodeSaved(true);
      } catch (submitError) {
        setCodeError(submitError instanceof Error ? submitError.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <div>
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
      <div className={styles.inlineForm} style={{ marginTop: "var(--space-2)" }}>
        <Input
          label="Scanner-Code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setCodeSaved(false);
          }}
          placeholder="z.B. ein Codewort für die Helfer"
        />
        <Button variant="secondary" size="sm" onClick={handleSaveCode} disabled={isCodePending}>
          Speichern
        </Button>
        {codeSaved && !codeError && <span style={{ color: "var(--color-text-secondary)" }}>Gespeichert.</span>}
        {codeError && <span style={{ color: "var(--color-error-text)" }}>{codeError}</span>}
      </div>
    </div>
  );
}
