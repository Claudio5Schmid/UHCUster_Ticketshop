import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ProductBenefits } from "@/lib/products";

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: "season_pass" | "membership";
  price_rappen: number;
  tier_level: number;
  benefits: ProductBenefits;
  active: boolean;
  sort_order: number;
  valid_season: string;
}

export async function getAllProducts(): Promise<AdminProduct[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, description, type, price_rappen, tier_level, benefits, active, sort_order, valid_season")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load products: ${error.message}`);
  return data ?? [];
}

export async function getProduct(id: string): Promise<AdminProduct | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, slug, name, description, type, price_rappen, tier_level, benefits, active, sort_order, valid_season")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load product: ${error.message}`);
  return data;
}
