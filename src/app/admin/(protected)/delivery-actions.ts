"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { backfillDeliveryHistory, type BackfillReport } from "@/lib/admin/email-backfill";

/**
 * Fetches what Resend knows about the mails sent before the shop kept a log and
 * writes them into it, so their outcome lands where the office reads it.
 *
 * Safe to run again: a mail already in the log is skipped, and a bounce that has
 * been superseded by a later send to the same person changes nothing.
 */
export async function syncDeliveryHistoryAction(): Promise<BackfillReport> {
  const supabase = await getSupabaseServerClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) throw new Error("Nicht berechtigt.");

  const report = await backfillDeliveryHistory();
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  return report;
}
