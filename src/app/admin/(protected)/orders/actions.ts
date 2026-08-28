"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueTicketsForOrder } from "@/lib/tickets/issue";
import type { OrderStatus } from "@/lib/admin/orders";

export async function updateOrderStatus(orderId: string, orderNumber: string, newStatus: OrderStatus) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("transition_order_status", {
    p_order_id: orderId,
    p_new_status: newStatus,
  });

  if (error) {
    throw new Error(error.message);
  }

  // Ticket PDFs are issued the moment an order is marked paid (docs/ARCHITECTURE.md
  // #3) - not on any other transition, and not retried automatically on failure
  // (the admin sees the error and can retry the status click; issue_tickets_for_order
  // itself refuses a second issuance for the same order either way).
  if (newStatus === "bezahlt") {
    await issueTicketsForOrder(orderId);
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderNumber}`);
}

export async function updateRefundOwed(orderId: string, orderNumber: string, owed: boolean) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_refund_owed", {
    p_order_id: orderId,
    p_owed: owed,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderNumber}`);
}

export async function updateFilesHandedOver(orderId: string, orderNumber: string, handedOver: boolean) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_files_handed_over", {
    p_order_id: orderId,
    p_handed_over: handedOver,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/orders/${orderNumber}`);
}

export async function renameTicketHolder(ticketId: string, orderNumber: string, newHolderName: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("rename_ticket_holder", {
    p_ticket_id: ticketId,
    p_new_holder_name: newHolderName,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/orders/${orderNumber}`);
}

/** Voids a single ticket with no replacement (docs/BACKLOG.md admin tooling
 * gap) - reissue_ticket() always creates a replacement, which isn't right for
 * "this ticket just shouldn't be valid anymore". */
export async function voidTicket(ticketId: string, orderNumber: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("void_ticket", { p_ticket_id: ticketId });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/admin/orders/${orderNumber}`);
}
