import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./SectionHeader.module.css";

interface SectionHeaderProps {
  title: string;
  /** A single link on the right, e.g. "Alle ansehen" to the full list. */
  action?: { href: string; label: string };
  /** One short line under the title - a hint, not a lead paragraph. */
  note?: ReactNode;
}

/** A section's title row in the shop's display style: capitals, heavy, tight. */
export function SectionHeader({ title, action, note }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.row}>
        <h2 className={styles.title}>{title}</h2>
        {action && (
          <Link href={action.href} className={styles.action}>
            {action.label}
          </Link>
        )}
      </div>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
