"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the scanner still works without the app-shell cache, it just
        // won't reopen from a cold, fully offline state.
      });
    }
  }, []);

  return null;
}
