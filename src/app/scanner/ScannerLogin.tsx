"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select/Select";
import { Input } from "@/components/ui/Input/Input";
import { Button } from "@/components/ui/Button/Button";
import { saveScannerSession } from "@/lib/scanner/session-storage";
import type { Game } from "@/lib/games";
import styles from "./scanner.module.css";

function formatGameDate(game: Game): string {
  return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(game.played_at)
  );
}

// The dropdown stays text: an <option> renders no markup, so a crest cannot go
// inside one. It is also the moment a volunteer has to be certain which game
// they are signing in for, which a name does better than a crest.
function formatGameOption(game: Game): string {
  return `${formatGameDate(game)} - UHC Uster vs. ${game.opponent}`;
}

export function ScannerLogin({ games }: { games: Game[] }) {
  const router = useRouter();
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/scanner/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, code, deviceLabel }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Anmeldung fehlgeschlagen.");
        return;
      }
      const game = games.find((g) => g.id === gameId);
      saveScannerSession({
        token: data.token,
        gameId,
        deviceLabel,
        gameLabel: game ? formatGameDate(game) : "",
        opponent: game?.opponent,
      });
      router.push("/scanner/scan");
    } catch {
      setError("Verbindung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (games.length === 0) {
    return (
      <div className={styles.page}>
        <p className={styles.hint}>Es sind keine Heimspiele für diese Saison hinterlegt.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/uhc-uster-logo.png" alt="UHC Uster" className={styles.logo} />
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>Scanner anmelden</h1>
        <Select label="Spiel" value={gameId} onChange={(event) => setGameId(event.target.value)} required>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {formatGameOption(game)}
            </option>
          ))}
        </Select>
        <Input
          label="Scanner-Code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Vom Vereinsbüro erhalten"
          required
        />
        <Input
          label="Gerätename"
          value={deviceLabel}
          onChange={(event) => setDeviceLabel(event.target.value)}
          placeholder="z.B. Haupteingang 1"
          required
        />
        {error && <p className={styles.error}>{error}</p>}
        <Button type="submit" disabled={isSubmitting} fullWidth>
          {isSubmitting ? "Anmelden..." : "Scanner starten"}
        </Button>
      </form>
    </div>
  );
}
