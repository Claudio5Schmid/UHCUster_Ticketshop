"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import styles from "../../admin.module.css";

/**
 * The customer's signed order link (docs/DECISIONS.md D54), ready to paste into the
 * invoice mail the office writes by hand anyway. It is also in the automatic order
 * confirmation - this is here for the cases that mail did not reach: a typo in the
 * address, a spam folder, or a customer phoning in.
 */
export function CustomerLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, browser policy); the URL
      // is on screen next to the button, so it stays copyable by hand.
      setCopied(false);
    }
  }

  return (
    <div className={styles.customerLink}>
      {/* The full URL used to be set as a wrapping code block the width of the
          page - a signed token is long, so it took three lines and became the
          biggest thing on the screen, to be read by nobody. It stays on one
          line, truncated, as a label for the button beside it; the button is
          what anybody actually uses, and the title attribute still shows the
          whole thing on hover. */}
      <span className={styles.customerLinkLabel}>Kundenlink</span>
      <code className={styles.customerLinkUrl} title={url}>
        {url}
      </code>
      <Button variant="secondary" size="sm" onClick={handleCopy}>
        {copied ? "Kopiert" : "Link kopieren"}
      </Button>
    </div>
  );
}
