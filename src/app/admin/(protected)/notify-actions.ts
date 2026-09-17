"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { previewOrderMail, sendOrderMails, sendOrderTestMail, type OrderSendResult, type RenderedOrderMail } from "@/lib/admin/order-notify";
import { SEND_CONFIRMATION_PHRASE, matchesSendConfirmation } from "@/lib/admin/send-confirmation";

export async function previewOrderMailAction(orderId: string, subject: string, body: string): Promise<RenderedOrderMail & { to: string }> {
  return previewOrderMail(orderId, subject, body);
}

export async function sendOrderTestMailAction(orderId: string, subject: string, body: string, to: string): Promise<void> {
  await sendOrderTestMail(orderId, subject, body, to);
}

/** The signed-in admin's own address, the default for a test mail. */
export async function currentAdminEmailAction(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? "";
}

/**
 * One chunk of the send. Gated on the typed confirmation phrase like the member
 * send (D42): not authentication, a deliberate pause before something that
 * cannot be taken back. The browser walks the selection a few orders at a time
 * so the progress bar moves; the phrase travels with every chunk.
 */
export async function sendOrderMailsAction(
  subject: string,
  body: string,
  confirmationPhrase: string,
  orderIds: string[],
  options: { includeAlreadyNotified: boolean }
): Promise<OrderSendResult> {
  if (!matchesSendConfirmation(confirmationPhrase)) {
    throw new Error(`Bitte "${SEND_CONFIRMATION_PHRASE}" eingeben, um den Versand zu bestätigen.`);
  }
  if (orderIds.length === 0) {
    throw new Error("Keine Bestellungen ausgewählt.");
  }
  const result = await sendOrderMails(subject, body, orderIds, options);
  revalidatePath("/admin");
  return result;
}
