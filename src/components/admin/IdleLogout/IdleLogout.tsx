"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logout } from "@/app/admin/actions";
import { Modal } from "@/components/ui/Modal/Modal";
import { Button } from "@/components/ui/Button/Button";
import { ADMIN_INACTIVITY_TIMEOUT_MS, ADMIN_INACTIVITY_WARNING_MS } from "@/lib/admin/session";
import styles from "./IdleLogout.module.css";

/**
 * Shared across every admin tab on purpose: an admin with the orders list open
 * in one tab and a member in another is one person, and working in either has
 * to keep both alive. sessionStorage would give each tab its own clock and log
 * out the one they happened not to click in.
 */
const STORAGE_KEY = "uhc-admin-last-activity";

const CHECK_INTERVAL_MS = 15_000;

/** Writing on every keystroke is pointless against an hour-long window. */
const WRITE_THROTTLE_MS = 5_000;

/**
 * Signs an idle admin out. Until this existed an admin session never ended:
 * there is no time-box and no inactivity timeout, and with refresh-token
 * rotation on, a tab left open on the club laptop stayed logged in forever.
 *
 * This is a real sign-out, not a redirect - it calls the same server action as
 * the "Abmelden" button, which revokes the session on Supabase's side. What it
 * cannot cover is a browser closed before the countdown fires; the cookie then
 * outlives the tab, which is what the hosted inactivity-timeout setting in
 * docs/OPERATIONS.md is for.
 */
export function IdleLogout() {
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);
  // Falls back to this tab's own memory where localStorage is unavailable
  // (private windows, browsers set to block site data) - the timeout still
  // works, it just stops being shared between tabs. Seeded in an effect, not at
  // render time, because reading the clock during render is not idempotent.
  const fallbackRef = useRef(0);
  const lastWriteRef = useRef(0);
  const signingOutRef = useRef(false);

  const readLastActivity = useCallback(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(stored) && stored > 0) return stored;
    } catch {
      // see fallbackRef
    }
    // The `|| Date.now()` guards the first tick against an unseeded ref: reading
    // zero here would look like an infinitely idle admin and sign them straight out.
    return fallbackRef.current || Date.now();
  }, []);

  const markActive = useCallback(() => {
    const now = Date.now();
    fallbackRef.current = now;
    if (now - lastWriteRef.current > WRITE_THROTTLE_MS) {
      lastWriteRef.current = now;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // see fallbackRef
      }
    }
    setMinutesLeft(null);
  }, []);

  useEffect(() => {
    const now = Date.now();
    fallbackRef.current = now;
    try {
      // An existing shared timestamp is left alone on purpose: reloading a page
      // should not silently extend a session another tab is counting down.
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      }
    } catch {
      // see fallbackRef
    }
  }, []);

  useEffect(() => {
    const handleActivity = () => markActive();
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [markActive]);

  useEffect(() => {
    function check() {
      if (signingOutRef.current) return;

      const idleFor = Date.now() - readLastActivity();
      if (idleFor >= ADMIN_INACTIVITY_TIMEOUT_MS) {
        signingOutRef.current = true;
        // The action redirects on success. If it fails outright the session is
        // still live, so releasing the guard to retry on the next tick beats
        // navigating to a login page that would just bounce back.
        void logout().catch(() => {
          signingOutRef.current = false;
        });
        return;
      }

      const remaining = ADMIN_INACTIVITY_TIMEOUT_MS - idleFor;
      setMinutesLeft(remaining <= ADMIN_INACTIVITY_WARNING_MS ? Math.max(1, Math.ceil(remaining / 60_000)) : null);
    }

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    // A backgrounded tab throttles timers to a minute or worse, so the check has
    // to run again the moment it comes back to the front - otherwise an admin
    // returning after two hours sees the page before the timer catches up.
    function handleVisibility() {
      if (document.visibilityState === "visible") check();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    check();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [readLastActivity]);

  return (
    <Modal open={minutesLeft !== null} onClose={markActive} title="Noch da?">
      <p className={styles.message}>
        Der Admin-Bereich meldet nach einer Stunde ohne Aktivität automatisch ab. Das passiert in{" "}
        <strong>{minutesLeft === 1 ? "einer Minute" : `${minutesLeft} Minuten`}</strong>.
      </p>
      <div className={styles.actions}>
        <Button type="button" onClick={markActive}>
          Angemeldet bleiben
        </Button>
      </div>
    </Modal>
  );
}
