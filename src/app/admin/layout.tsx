import styles from "./admin-scale.module.css";

/**
 * Wraps the whole admin area - login, setup and the protected pages alike - in
 * the admin type scale. Nothing else: the protected pages keep their own layout
 * with the nav and the idle timer, this only re-declares the size tokens for the
 * subtree (see admin-scale.module.css).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.adminScale}>{children}</div>;
}
