"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { CURRENT_SEASON } from "@/lib/season";

interface ProductFormInput {
  slug: string;
  name: string;
  description: string;
  type: "season_pass" | "membership";
  priceRappen: number;
  tierLevel: number;
  sortOrder: number;
  active: boolean;
  highlights: string[];
  singleTicketPriceRappen: number | null;
  includedPasses: number | null;
  transferable: boolean;
}

function buildBenefits(input: ProductFormInput) {
  const benefits: Record<string, unknown> = { highlights: input.highlights };
  if (input.singleTicketPriceRappen !== null) benefits.single_ticket_price_rappen = input.singleTicketPriceRappen;
  if (input.includedPasses !== null) benefits.included_passes = input.includedPasses;
  if (input.transferable) benefits.transferable = true;
  return benefits;
}

export async function createProduct(input: ProductFormInput) {
  const supabase = await getSupabaseServerClient();

  const { error } = await supabase.from("products").insert({
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    type: input.type,
    price_rappen: input.priceRappen,
    tier_level: input.tierLevel,
    sort_order: input.sortOrder,
    active: input.active,
    valid_season: CURRENT_SEASON,
    benefits: buildBenefits(input),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProduct(productId: string, currentPriceRappen: number, input: ProductFormInput) {
  const supabase = await getSupabaseServerClient();

  // Price changes go through a direct update - the price_history trigger on
  // products picks it up automatically. Everything else goes through
  // update_product_details() so it's logged to audit_log with a proper diff.
  if (input.priceRappen !== currentPriceRappen) {
    const { error: priceError } = await supabase
      .from("products")
      .update({ price_rappen: input.priceRappen })
      .eq("id", productId);
    if (priceError) throw new Error(priceError.message);
  }

  const { error } = await supabase.rpc("update_product_details", {
    p_product_id: productId,
    p_name: input.name,
    p_description: input.description || null,
    p_benefits: buildBenefits(input),
    p_tier_level: input.tierLevel,
    p_sort_order: input.sortOrder,
    p_active: input.active,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}
