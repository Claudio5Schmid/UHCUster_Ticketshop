"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time, re-read once a minute, for anything that counts down.
 *
 * Built on useSyncExternalStore rather than state + effect so the hydration
 * render uses `serverNow` - the instant the server rendered with - and the
 * markup matches byte for byte. The first client snapshot, taken right after
 * hydration, then replaces it. (This also keeps the React Compiler's
 * set-state-in-effect rule quiet, which a setInterval-in-useEffect would trip.)
 *
 * Snapshots are truncated to the interval so consecutive reads within the same
 * minute return the same number - useSyncExternalStore requires that.
 */
export function useNow(serverNow: number, intervalMs = 60_000): number {
  return useSyncExternalStore(
    (onChange) => {
      // Fire once right away so the stale server instant is replaced without
      // waiting a full interval, then keep ticking.
      const immediate = setTimeout(onChange, 0);
      const interval = setInterval(onChange, intervalMs);
      return () => {
        clearTimeout(immediate);
        clearInterval(interval);
      };
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => serverNow
  );
}
