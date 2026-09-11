"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { SalesChannelType } from "@/lib/shop/sales-channels";

/**
 * Flips where one kind of product is sold, and where the button leads when it is
 * sold elsewhere. The database refuses a redirect without an https address, so a
 * dead button cannot be saved.
 */
export async function setSalesChannelAction(
  productType: SalesChannelType,
  redirectToWebsite: boolean,
  websiteUrl: string
) {
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_sales_channel", {
    p_product_type: productType,
    p_redirect_to_website: redirectToWebsite,
    p_website_url: websiteUrl,
  });

  if (error) throw new Error(error.message);

  // The two shop pages render the buttons, and both are revalidated on a timer -
  // without this the change would only surface on the next tick.
  revalidatePath("/");
  revalidatePath("/red-castle-club");
  revalidatePath("/admin/sales");
}
