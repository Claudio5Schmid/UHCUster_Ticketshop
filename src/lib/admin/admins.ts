import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase";

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export async function getAllAdmins(): Promise<AdminUser[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("admin_users").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(`Failed to load admins: ${error.message}`);
  return data ?? [];
}

/**
 * The in-app version of what docs/BACKLOG.md flagged as "documented SQL
 * steps" - creating a real Supabase Auth user is a service-role-only
 * operation (mirrors bootstrapFirstAdmin in src/app/admin/actions.ts), but
 * the admin_users insert itself goes through the caller's own session so
 * it's still gated by the real "Admins can insert admin_users" RLS policy,
 * not just this function's own is_admin() check.
 */
export async function createAdditionalAdmin(email: string, password: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    throw new Error("Nur bestehende Admins können weitere Admin-Konten erstellen.");
  }

  const adminClient = getSupabaseAdminClient();
  const { data: userData, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !userData.user) {
    throw new Error(createUserError?.message ?? "Konto konnte nicht erstellt werden.");
  }

  const { error: insertError } = await supabase.from("admin_users").insert({ user_id: userData.user.id, email });
  if (insertError) {
    throw new Error(insertError.message);
  }
}

/**
 * Only removes the admin_users row (RLS-gated via the caller's own session) -
 * the underlying Auth account is left alone, so a mistaken removal is
 * recoverable by re-adding the same person without recreating their login.
 * Guards against locking everyone out: can't remove yourself, can't remove
 * the last remaining admin.
 */
export async function removeAdmin(userId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id === userId) {
    throw new Error("Du kannst dich nicht selbst entfernen.");
  }

  const { count } = await supabase.from("admin_users").select("*", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    throw new Error("Der letzte Admin kann nicht entfernt werden.");
  }

  const { error } = await supabase.from("admin_users").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
