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
    <div className={styles.section}>
      <h2>Kundenlink</h2>
      <div className={styles.actions} style={{ alignItems: "center" }}>
        <code
          className={styles.copyBlock}
          style={{ flex: "1 1 320px", minWidth: 0, overflowWrap: "anywhere", margin: 0 }}
        >
          {url}
        </code>
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? "Kopiert" : "Link kopieren"}
        </Button>
      </div>
    </div>
  );
}
