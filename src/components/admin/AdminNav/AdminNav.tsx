import Link from "next/link";
import { logout } from "@/app/admin/actions";
import styles from "./AdminNav.module.css";

export function AdminNav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.bar}>
        <div className={styles.links}>
          <Link href="/admin">Bestellungen</Link>
          <Link href="/admin/products">Preise</Link>
          <Link href="/admin/schedule">Spielplan</Link>
          <Link href="/admin/export">Export</Link>
        </div>
        <form action={logout}>
          <button type="submit" className={styles.logoutButton}>
            Abmelden
          </button>
        </form>
      </div>
    </nav>
  );
}
