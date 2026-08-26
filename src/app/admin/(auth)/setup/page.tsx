import { getSupabaseAdminClient } from "@/lib/supabase";
import { SetupForm } from "./SetupForm";
import styles from "@/app/admin/admin-auth.module.css";

export const metadata = {
  title: "Admin einrichten - UHC Uster Ticketshop",
};

export default async function AdminSetupPage() {
  const adminClient = getSupabaseAdminClient();
  const { count } = await adminClient.from("admin_users").select("*", { count: "exact", head: true });
  const alreadySetUp = Boolean(count && count > 0);

  return (
    <div className={styles.page}>
      {alreadySetUp ? (
        <div className={styles.card}>
          <div className={styles.title}>Bereits eingerichtet</div>
          <p className={styles.hint}>
            Es existiert bereits ein Admin-Konto. Neue Admin-Konten werden von einem bestehenden Admin
            direkt in Supabase hinzugefügt.
          </p>
        </div>
      ) : (
        <SetupForm />
      )}
    </div>
  );
}
