import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/admin/actions";
import styles from "./AdminNav.module.css";

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
          <Link href="/admin/members">Mitglieder</Link>
          <Link href="/admin">Bestellungen</Link>
          <Link href="/admin/products">Preise</Link>
          <Link href="/admin/schedule">Spielplan</Link>
          <Link href="/admin/dashboard">Dashboard</Link>
          <Link href="/admin/export">Export</Link>
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
