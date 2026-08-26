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
