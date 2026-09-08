"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadScannerSession, clearScannerSession, type StoredScannerSession } from "@/lib/scanner/session-storage";
import { useScannerEngine, type ScanFeedback } from "@/lib/scanner/useScannerEngine";
import { useBarcodeCamera } from "@/lib/scanner/useBarcodeCamera";
import { playAcceptedSound, playRejectedSound, vibrateAccepted, vibrateRejected } from "@/lib/scanner/feedback";
import { Matchup } from "@/components/match/Matchup/Matchup";
import styles from "../scanner.module.css";

const FEEDBACK_TEXT: Record<ScanFeedback["kind"], { title: string; icon: string }> = {
  accepted: { title: "Zutritt gewährt", icon: "✓" },
  already_redeemed: { title: "Bereits gescannt", icon: "⟳" },
  voided: { title: "Ticket ungültig", icon: "✕" },
  not_found: { title: "Ticket nicht gefunden", icon: "✕" },
  invalid_signature: { title: "Ungültiges Format", icon: "✕" },
  checking: { title: "Wird geprüft...", icon: "…" },
};

/**
 * The fixture in the status bar, as crests like everywhere else. They sit on a
 * light chip because this screen is pure black: several clubs ship their crest
 * on white and Kloten-Dietlikon's is on black, so on the raw background one of
 * them would be a white block and another would vanish entirely.
 *
 * A session saved before the scanner stored the opponent keeps working - it just
 * shows the date on its own.
 */
function SessionFixture({ session }: { session: StoredScannerSession }) {
  return (
    <span className={styles.fixture}>
      {session.opponent && (
        <span className={styles.fixtureCrests}>
          <Matchup opponent={session.opponent} size="sm" />
        </span>
      )}
      <span>{session.gameLabel}</span>
    </span>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function ScanningView({ session, onExit }: { session: StoredScannerSession; onExit: () => void }) {
  const { status, error, ticketCount, lastResult, pendingSyncCount, processScan } = useScannerEngine(session);
  const [locked, setLocked] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastHandledResult = useRef<ScanFeedback | null>(null);

  const { error: cameraError } = useBarcodeCamera(videoRef, {
    onDecode: (text) => {
      if (!locked) {
        setLocked(true);
        processScan(text);
      }
    },
    paused: locked,
  });

  useEffect(() => {
    if (!lastResult || lastResult === lastHandledResult.current) return;
    lastHandledResult.current = lastResult;

    if (lastResult.kind === "checking") return;

    if (lastResult.kind === "accepted") {
      playAcceptedSound();
      vibrateAccepted();
    } else {
      playRejectedSound();
      vibrateRejected();
    }
  }, [lastResult]);

  function handleManualSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!manualToken.trim() || locked) return;
    setLocked(true);
    processScan(manualToken.trim());
    setManualToken("");
  }

  if (status === "loading") {
    return (
      <div className={styles.scanPage}>
        <div className={styles.topBar}>
          <SessionFixture session={session} />
        </div>
        <p style={{ margin: "auto", color: "#fff" }}>Ticketliste wird geladen...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={styles.scanPage}>
        <p style={{ margin: "auto", color: "#fff", padding: "0 24px", textAlign: "center" }}>{error}</p>
      </div>
    );
  }

  const feedback = lastResult && locked ? FEEDBACK_TEXT[lastResult.kind] : null;
  const feedbackClass =
    lastResult?.kind === "accepted"
      ? styles.feedbackAccepted
      : lastResult?.kind === "checking"
        ? styles.feedbackChecking
        : lastResult?.kind === "already_redeemed"
          ? styles.feedbackWarning
          : styles.feedbackRejected;

  /**
   * A result now stays up until someone taps it away. The previous 800ms
   * auto-release meant a scan could come and go before the person holding the
   * phone had looked at it, and a card left lying in front of the lens
   * re-scanned itself every 800ms, writing a permanent scan_events row each
   * time. "checking" is deliberately not dismissible: the answer is still in
   * flight, and unlocking here would hide the result that is about to arrive.
   */
  const isTerminal = lastResult !== null && lastResult.kind !== "checking";

  function rearm() {
    if (!isTerminal) return;
    setLocked(false);
  }

  return (
    <div className={styles.scanPage}>
      <div className={styles.topBar}>
        <SessionFixture session={session} />
        <span>
          {session.deviceLabel} · {ticketCount} Tickets
          {pendingSyncCount > 0 && <span className={styles.pendingBadge}>{pendingSyncCount} in Warteschlange</span>}
        </span>
        <button
          type="button"
          onClick={onExit}
          style={{ background: "none", border: "none", color: "inherit", font: "inherit", textDecoration: "underline", padding: 0 }}
        >
          Beenden
        </button>
      </div>

      <div className={styles.cameraWrap}>
        <video ref={videoRef} className={styles.video} muted playsInline autoPlay />
        {cameraError && (
          <p style={{ position: "absolute", top: "50%", left: 0, right: 0, textAlign: "center", color: "#fff", padding: "0 24px" }}>
            {cameraError}
          </p>
        )}
      </div>

      {!locked && (
        <form className={styles.manualEntry} onSubmit={handleManualSubmit}>
          <input
            value={manualToken}
            onChange={(event) => setManualToken(event.target.value)}
            placeholder="Ticket-Code manuell eingeben"
            autoComplete="off"
            autoCapitalize="characters"
          />
          <button type="submit" hidden />
        </form>
      )}

      {feedback && lastResult && (
        <div
          className={`${styles.feedback} ${feedbackClass}`}
          role={isTerminal ? "button" : undefined}
          tabIndex={isTerminal ? 0 : undefined}
          onClick={rearm}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              rearm();
            }
          }}
        >
          <span className={styles.feedbackIcon} aria-hidden="true">
            {feedback.icon}
          </span>
          <p className={styles.feedbackTitle}>{feedback.title}</p>
          {lastResult.holderName && <p className={styles.feedbackDetail}>{lastResult.holderName}</p>}
          {lastResult.productName && <p className={styles.feedbackDetail}>{lastResult.productName}</p>}
          {/* already_redeemed can only ever mean an earlier scan was accepted - the
              partial unique index on scan_events fires on accepted rows only - so the
              outcome of that first scan is known without carrying it around. The time
              is missing when the device decided offline from its own ticket list. */}
          {lastResult.kind === "already_redeemed" && (
            <p className={styles.feedbackDetail}>
              {lastResult.redeemedAt
                ? `Erster Scan: Zutritt gewährt um ${formatTime(lastResult.redeemedAt)}`
                : "Erster Scan: Zutritt gewährt"}
            </p>
          )}
          {isTerminal && <p className={styles.feedbackHint}>Zum Weiterscannen tippen</p>}
        </div>
      )}
    </div>
  );
}

export function ScannerScanApp() {
  const router = useRouter();
  const [session, setSession] = useState<StoredScannerSession | null | "loading">("loading");

  useEffect(() => {
    // One-time read of a browser-only store (sessionStorage doesn't exist during
    // SSR) to decide whether to redirect - not a recurring sync, so there's no
    // cascading-render loop despite the setState living directly in the effect.
    const stored = loadScannerSession();
    if (!stored) {
      router.replace("/scanner");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(stored);
  }, [router]);

  if (session === "loading" || session === null) {
    return <div className={styles.scanPage} />;
  }

  return (
    <ScanningView
      session={session}
      onExit={() => {
        clearScannerSession();
        router.push("/scanner");
      }}
    />
  );
}
