"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
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
