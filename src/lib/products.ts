import { getSupabaseClient } from "@/lib/supabase";

export interface ProductBenefits {
  highlights?: string[];
  /** Reference price for the savings calculation, in Rappen. Only set on products
   * that are directly comparable to a single-game ticket (see docs/DECISIONS.md and
   * the brief: "show the equivalent single-ticket value and the saving... calculated,
   * not maintained as text"). */
  single_ticket_price_rappen?: number;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: "season_pass" | "membership";
  price_rappen: number;
  tier_level: number;
  benefits: ProductBenefits;
  sort_order: number;
  valid_season: string;
}

export async function getActiveProducts(): Promise<Product[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, description, type, price_rappen, tier_level, benefits, sort_order, valid_season")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load products: ${error.message}`);
  }

  return data ?? [];
}
