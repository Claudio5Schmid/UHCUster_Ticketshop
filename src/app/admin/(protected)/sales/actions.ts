"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { SalesChannelType, SalesMode } from "@/lib/shop/sales-channels";

/**
 * Sets how one kind of product is bought, and where the button leads when that
 * is somewhere else. The database refuses a website mode without an https
 * address, so a link to nowhere cannot be saved.
 */
export async function setSalesChannelAction(
  productType: SalesChannelType,
  mode: SalesMode,
  websiteUrl: string,
  note: string
) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_sales_channel", {
    p_product_type: productType,
    p_mode: mode,
    p_website_url: websiteUrl,
    p_note: note,
  });

  if (error) throw new Error(error.message);

  // The two shop pages render the buttons, and both are revalidated on a timer -
  // without this the change would only surface on the next tick.
  revalidatePath("/");
  revalidatePath("/red-castle-club");
  revalidatePath("/admin/sales");
}
