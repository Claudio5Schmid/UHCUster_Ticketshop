"use server";

import { revalidatePath } from "next/cache";
import { createAdditionalAdmin, removeAdmin } from "@/lib/admin/admins";

export async function createAdminAction(email: string, password: string) {
  await createAdditionalAdmin(email, password);
  revalidatePath("/admin/admins");
}

export async function removeAdminAction(userId: string) {
  await removeAdmin(userId);
  revalidatePath("/admin/admins");
}
