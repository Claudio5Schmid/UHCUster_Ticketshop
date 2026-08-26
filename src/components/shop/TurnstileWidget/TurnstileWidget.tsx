"use client";

import Script from "next/script";

interface TurnstileWidgetProps {
  siteKey: string;
}

/**
 * Cloudflare Turnstile, implicit rendering: the script finds this div by class and
 * renders the widget, auto-injecting a hidden `cf-turnstile-response` input into the
 * nearest <form> ancestor - read that from FormData on submit, no callback needed.
 */
export function TurnstileWidget({ siteKey }: TurnstileWidgetProps) {
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} data-theme="light" />
    </>
  );
}
