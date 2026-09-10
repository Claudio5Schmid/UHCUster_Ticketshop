"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

/** What the checkout needs to know about the challenge, in the order it happens. */
export type TurnstileState =
  | "unconfigured"
  | "loading"
  | "ready"
  | "error"
  | "expired";

interface TurnstileWidgetProps {
  siteKey: string;
  /** Called with the state and, once solved, the token to send with the order. */
  onStateChange: (state: TurnstileState, token: string) => void;
  /**
   * Bump to throw the current challenge away and start a fresh one - what the
   * "Erneut versuchen" button does after an error or an expiry. A number rather
   * than a callback so the widget id never has to leave this component.
   */
  resetSignal?: number;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: string;
      callback: (token: string) => void;
      "error-callback": (code?: unknown) => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    }
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile, rendered explicitly rather than by the script's own
 * class scan.
 *
 * The implicit version this replaces had one failure mode and no way to report
 * it: with `data-sitekey=""` - which is what a missing NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * inlines at build time - Cloudflare's script quietly renders nothing, no hidden
 * `cf-turnstile-response` input is ever injected, and the checkout sat on "Bitte
 * warte, bis die Sicherheitsprüfung geladen ist" for as long as anyone was willing
 * to wait. The same silence covered a challenge that errored or expired. Rendering
 * by hand is what buys the error/expired/timeout callbacks, so the checkout can say
 * which of those happened and offer the one thing that helps (retry), instead of
 * describing every failure as "still loading".
 *
 * An empty site key is reported before the script is even asked to load: that is a
 * deployment that cannot take an order, and it should read as broken rather than slow.
 */
export function TurnstileWidget({ siteKey, onStateChange, resetSignal = 0 }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const configured = siteKey.trim().length > 0;

  // Held in a ref so re-rendering the checkout (every keystroke in the address
  // form does) never tears the challenge down and starts it over.
  const notifyRef = useRef(onStateChange);
  useEffect(() => {
    notifyRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    if (!configured) {
      notifyRef.current("unconfigured", "");
    }
  }, [configured]);

  useEffect(() => {
    if (!configured || !scriptReady) return;
    const api = window.turnstile;
    const container = containerRef.current;
    if (!api || !container) return;

    notifyRef.current("loading", "");
    const id = api.render(container, {
      sitekey: siteKey,
      theme: "light",
      callback: (token) => notifyRef.current("ready", token),
      "error-callback": () => notifyRef.current("error", ""),
      "expired-callback": () => notifyRef.current("expired", ""),
      "timeout-callback": () => notifyRef.current("expired", ""),
    });

    return () => {
      try {
        api.remove(id);
      } catch {
        // Already gone (script torn down, container detached) - nothing to undo.
      }
    };
    // resetSignal is the retry: changing it tears the challenge down and renders a new one.
  }, [configured, scriptReady, siteKey, resetSignal]);

  if (!configured) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => notifyRef.current("error", "")}
      />
      <div ref={containerRef} />
    </>
  );
}
