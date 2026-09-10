"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type AdminNavItem } from "./links";
import styles from "./AdminNav.module.css";

/** A plain entry in the admin bar - Mitglieder, Bestellungen. */
export function AdminNavLink({ item }: { item: AdminNavItem }) {
  const pathname = usePathname();

  return (
    <Link href={item.href} className={styles.link} data-current={isActive(item.href, pathname) || undefined}>
      {item.label}
    </Link>
  );
}
