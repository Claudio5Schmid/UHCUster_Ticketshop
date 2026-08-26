import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AdminNav } from "@/components/admin/AdminNav/AdminNav";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  // Defensive re-check beyond middleware's session check: a real Supabase session
  // without an admin_users row (shouldn't happen - there's no public sign-up path -
  // but this is what actually enforces "restricted to admin_users", not just
  // "logged in somehow").
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login");
  }

  return (
    <div>
      <AdminNav />
      <main style={{ maxWidth: "var(--content-max-width)", marginInline: "auto", padding: "var(--space-6) var(--container-padding-mobile)" }}>
        {children}
      </main>
    </div>
  );
}
