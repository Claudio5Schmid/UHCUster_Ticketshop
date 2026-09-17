"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueTicketsForOrder } from "@/lib/tickets/issue";
import type { OrderStatus } from "@/lib/admin/orders";

function revalidateOrder(orderNumber: string) {
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${orderNumber}`);
}

/**
 * The status walk (D78): neu -> rechnung_versendet (with the invoice number)
 * -> bezahlt, and storniert from the first two. The database enforces the
 * transitions and voids the cards on cancellation; this only carries the
 * admin's click there and refreshes the pages that show it.
 */
export async function updateOrderStatus(
  orderId: string,
  orderNumber: string,
  newStatus: OrderStatus,
  invoiceNumber?: string
) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("transition_order_status", {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_invoice_number: invoiceNumber ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateOrder(orderNumber);
}

/** A correction to the invoice number after the fact, no status change. */
export async function updateInvoiceNumber(orderId: string, orderNumber: string, invoiceNumber: string) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_invoice_number", {
    p_order_id: orderId,
    p_invoice_number: invoiceNumber,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateOrder(orderNumber);
}

/**
 * For an order that has no cards yet: one placed before the invoice flow, or one
 * whose issuance failed during checkout (the checkout logs and swallows that so
 * the customer still gets their order number). The database refuses it for an
 * order that already has cards, so a double click cannot mint a second set.
 */
export async function issueMissingTickets(orderId: string, orderNumber: string) {
  await issueTicketsForOrder(orderId);
  revalidateOrder(orderNumber);
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

  revalidateOrder(orderNumber);
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

// Renaming a holder, deactivating a card and regenerating its code live in
// ../ticket-actions.ts, because the same table drives them from a member's
// page as well as from here.
