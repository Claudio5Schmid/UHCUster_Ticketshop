"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { regenerateTicket } from "@/lib/tickets/issue";

/**
 * The same ticket table is mounted on the order detail page and on a member's
 * page, so each action is told which of them to refresh rather than guessing.
 * Both may be given: a member's cards are an order's tickets.
 */
export interface TicketActionTarget {
  orderNumber?: string;
  memberId?: string;
}

function revalidateTarget(target: TicketActionTarget) {
  if (target.orderNumber) revalidatePath(`/admin/orders/${target.orderNumber}`);
  if (target.memberId) revalidatePath(`/admin/members/${target.memberId}`);
  // The member list shows per-member card counts and how many are still to
  // send, so every one of these changes what it should say.
  revalidatePath("/admin/members");
}

export async function renameTicketHolderAction(ticketId: string, newHolderName: string, target: TicketActionTarget) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("rename_ticket_holder", {
    p_ticket_id: ticketId,
    p_new_holder_name: newHolderName,
  });

  if (error) throw new Error(error.message);
  revalidateTarget(target);
}

/**
 * Deactivating is final: the card stops being accepted at the door and there is
 * no way back. A replacement is a separate, deliberate act - see
 * regenerateTicketAction - so a mis-click cannot quietly mint a new QR code.
 *
 * Note for the door: scanner devices decide from a ticket list downloaded when
 * they start, so a card deactivated during a match still gets in on a device
 * that is already running, until it reloads.
 */
export async function deactivateTicketAction(ticketId: string, target: TicketActionTarget) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("void_ticket", { p_ticket_id: ticketId });

  if (error) throw new Error(error.message);
  revalidateTarget(target);
}

/**
 * The lost-card path: retires this card and issues a fresh QR code in its place,
 * keeping the running number so member and office still call it the same thing.
 * The replacement counts as unsent, because the member has not been given it yet.
 */
export async function regenerateTicketAction(ticketId: string, target: TicketActionTarget) {
  await regenerateTicket(ticketId);
  revalidateTarget(target);
}
