import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/admin/actions";
import { ADMIN_NAV, isGroup } from "./links";
import { AdminNavLink } from "./AdminNavLink";
import { AdminNavMenu } from "./AdminNavMenu";
import styles from "./AdminNav.module.css";

/**
 * The admin bar. Still a server component: only the entries that need to know
 * the current path - and the two that open a menu - are client components.
 * The structure itself lives in links.ts.
 */
export function AdminNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.bar}>
        <Link href="/admin" className={styles.brand}>
          <Image src="/uhc-uster-logo.png" alt="UHC Uster" width={160} height={57} className={styles.logo} />
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.brandLabel}>Admin Bereich</span>
        </Link>
        <div className={styles.links}>
          {ADMIN_NAV.map((entry) =>
            isGroup(entry) ? (
              <AdminNavMenu key={entry.label} group={entry} />
            ) : (
              <AdminNavLink key={entry.href} item={entry} />
            )
          )}
        </div>
        <form action={logout} className={styles.logoutForm}>
          <button type="submit" className={styles.logoutButton}>
            Abmelden
          </button>
        </form>
      </div>
    </nav>
  );
}
