"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function login(email: string, password: string): Promise<{ error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "E-Mail oder Passwort ist falsch." };
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { error: "Dieses Konto hat keinen Zugriff auf den Admin-Bereich." };
  }

  redirect("/admin");
}

export async function logout() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/**
 * One-time bootstrap: only works while admin_users is still empty (checked via the
 * service-role client, since an unauthenticated visitor can't read admin_users
 * through RLS at all). Creates the Supabase Auth user and the first admin_users row
 * together. After this succeeds once, every subsequent call fails - there is no way
 * to self-register a second admin this way, per D15 (admin access is managed
 * manually by existing admins from here on).
 */
export async function bootstrapFirstAdmin(email: string, password: string): Promise<{ error?: string }> {
  const adminClient = getSupabaseAdminClient();

  const { count, error: countError } = await adminClient
    .from("admin_users")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return { error: countError.message };
  }
  if (count && count > 0) {
    return { error: "Es existiert bereits ein Admin-Konto. Bitte beim bestehenden Admin ein Konto anfragen." };
  }

  const { data: userData, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createUserError || !userData.user) {
    return { error: createUserError?.message ?? "Konto konnte nicht erstellt werden." };
  }

  const { error: insertError } = await adminClient
    .from("admin_users")
    .insert({ user_id: userData.user.id, email });

  if (insertError) {
    return { error: insertError.message };
  }

  redirect("/admin/login");
}
