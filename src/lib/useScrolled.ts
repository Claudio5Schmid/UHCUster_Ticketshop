"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/**
 * Whether the page is scrolled past `threshold` pixels. False on the server and
 * for the hydration render, so a header that starts transparent over the hero
 * always hydrates in the same state it rendered in.
 */
export function useScrolledPast(threshold: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.scrollY > threshold,
    () => false
  );
}
